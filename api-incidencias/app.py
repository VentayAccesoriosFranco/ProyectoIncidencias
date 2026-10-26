from datetime import datetime
import os
import uuid

from flask import Flask, jsonify, request, g, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
from sqlalchemy import text
from werkzeug.exceptions import RequestEntityTooLarge

from seguridad import requiere_autenticacion
from clasificador_ia import (
    clasificar_prioridad,
    sugerir_categoria,
    generar_resumen,
    CATEGORIAS
)

load_dotenv()

app = Flask(__name__)
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                "http://127.0.0.1:5500",
                "http://localhost:5500"
            ],
            "allow_headers": ["Authorization", "Content-Type"],
            "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
        }
    }
)

app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Fotografías: máximo 5 MB, guardadas fuera del frontend (acceso protegido).
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024
CARPETA_FOTOS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
EXTENSIONES_PERMITIDAS = {"jpg", "jpeg", "png", "webp"}

os.makedirs(CARPETA_FOTOS, exist_ok=True)

db = SQLAlchemy(app)


# ---------------------------------------------------------------------------
# Catálogos
# ---------------------------------------------------------------------------

ESTADOS_VALIDOS = ["Pendiente", "En proceso", "Resuelto"]
PRIORIDADES_VALIDAS = ["Baja", "Media", "Alta"]

# Etapas de seguimiento que ve el ciudadano. Cada etapa corresponde
# a uno de los tres estados oficiales del proyecto.
ETAPAS_AVANCE = [
    "Reporte recibido",
    "En revisión",
    "Personal asignado",
    "Personal en camino",
    "Trabajo en proceso",
    "Resuelto"
]

ESTADO_POR_ETAPA = {
    "Reporte recibido": "Pendiente",
    "En revisión": "Pendiente",
    "Personal asignado": "En proceso",
    "Personal en camino": "En proceso",
    "Trabajo en proceso": "En proceso",
    "Resuelto": "Resuelto"
}

ETAPA_POR_ESTADO = {
    "Pendiente": "En revisión",
    "En proceso": "Trabajo en proceso",
    "Resuelto": "Resuelto"
}


# ---------------------------------------------------------------------------
# Modelos
# ---------------------------------------------------------------------------

class Incidencia(db.Model):
    __tablename__ = "incidencias"

    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, nullable=False)
    titulo = db.Column(db.String(150), nullable=False)
    descripcion = db.Column(db.Text, nullable=False)
    categoria = db.Column(db.String(80), nullable=False)
    estado = db.Column(db.String(30), nullable=False, default="Pendiente")
    prioridad = db.Column(db.String(30), nullable=False, default="Media")
    latitud = db.Column(db.Float)
    longitud = db.Column(db.Float)

    # Campos agregados en la segunda etapa del proyecto
    fecha_creacion = db.Column(db.DateTime, default=datetime.now)
    fecha_actualizacion = db.Column(db.DateTime)
    foto = db.Column(db.String(255))
    categoria_sugerida = db.Column(db.String(80))
    resumen_ia = db.Column(db.Text)
    avance = db.Column(db.String(40), default="Reporte recibido")
    personal_id = db.Column(db.Integer)


class HistorialIncidencia(db.Model):
    __tablename__ = "historial_incidencias"

    id = db.Column(db.Integer, primary_key=True)
    incidencia_id = db.Column(
        db.Integer,
        db.ForeignKey("incidencias.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    fecha = db.Column(db.DateTime, nullable=False, default=datetime.now)
    usuario = db.Column(db.String(150), nullable=False)
    rol = db.Column(db.String(30))
    accion = db.Column(db.String(80), nullable=False)
    detalle = db.Column(db.Text)


def actualizar_esquema():
    """
    db.create_all() no agrega columnas a tablas que ya existen.
    Por eso agregamos las columnas nuevas con ALTER TABLE ... IF NOT EXISTS,
    sin perder las incidencias registradas anteriormente.
    """
    columnas = {
        "fecha_creacion": "TIMESTAMP DEFAULT NOW()",
        "fecha_actualizacion": "TIMESTAMP",
        "foto": "VARCHAR(255)",
        "categoria_sugerida": "VARCHAR(80)",
        "resumen_ia": "TEXT",
        "avance": "VARCHAR(40)",
        "personal_id": "INTEGER"
    }

    for nombre, tipo in columnas.items():
        db.session.execute(text(
            f"ALTER TABLE incidencias ADD COLUMN IF NOT EXISTS {nombre} {tipo}"
        ))

    # Las incidencias anteriores reciben una etapa acorde a su estado.
    db.session.execute(text("""
        UPDATE incidencias
        SET avance = CASE estado
            WHEN 'Resuelto' THEN 'Resuelto'
            WHEN 'En proceso' THEN 'Trabajo en proceso'
            ELSE 'Reporte recibido'
        END
        WHERE avance IS NULL
    """))

    db.session.commit()


with app.app_context():
    db.create_all()
    actualizar_esquema()


# ---------------------------------------------------------------------------
# Funciones auxiliares
# ---------------------------------------------------------------------------

def roles_actuales():
    return g.usuario_autenticado.get("realm_access", {}).get("roles", [])


def es_administrador():
    return "administrador" in roles_actuales()


def nombre_actor():
    token = g.usuario_autenticado
    return (
        token.get("name")
        or token.get("preferred_username")
        or "Usuario"
    )


def id_usuario_actual():
    """Busca el id de PostgreSQL del usuario autenticado en Keycloak."""
    fila = db.session.execute(
        text("SELECT id FROM usuarios WHERE keycloak_id = :kid"),
        {"kid": g.usuario_autenticado["sub"]}
    ).mappings().first()

    return fila["id"] if fila else None


def mapa_usuarios(ids):
    if not ids:
        return {}

    filas = db.session.execute(
        text("SELECT id, nombre FROM usuarios WHERE id = ANY(:ids)"),
        {"ids": list(ids)}
    ).mappings().all()

    return {fila["id"]: fila["nombre"] for fila in filas}


def mapa_personal(ids=None):
    """
    El catálogo de personal pertenece a la API de Usuarios y Gestión.
    Aquí solamente se consulta para mostrar el nombre del responsable.
    """
    try:
        if ids is None:
            consulta = text("SELECT id, nombre, especialidad, activo FROM personal")
            filas = db.session.execute(consulta).mappings().all()
        else:
            if not ids:
                return {}

            consulta = text(
                "SELECT id, nombre, especialidad, activo "
                "FROM personal WHERE id = ANY(:ids)"
            )
            filas = db.session.execute(consulta, {"ids": list(ids)}).mappings().all()

        return {fila["id"]: dict(fila) for fila in filas}

    except Exception as error:
        # La tabla aún no existe si la API de Usuarios no se ha iniciado.
        print("No fue posible consultar el personal:", error)
        db.session.rollback()
        return {}


def formatear_fecha(fecha):
    return fecha.isoformat(timespec="seconds") if fecha else None


def serializar_incidencia(incidencia, usuarios=None, personal=None):
    usuarios = usuarios or {}
    personal = personal or {}

    responsable = personal.get(incidencia.personal_id)

    return {
        "id": incidencia.id,
        "usuario_id": incidencia.usuario_id,
        "nombre_ciudadano": usuarios.get(
            incidencia.usuario_id, "Usuario no encontrado"
        ),
        "titulo": incidencia.titulo,
        "descripcion": incidencia.descripcion,
        "categoria": incidencia.categoria,
        "categoria_sugerida": incidencia.categoria_sugerida,
        "estado": incidencia.estado,
        "avance": incidencia.avance or "Reporte recibido",
        "prioridad": incidencia.prioridad,
        "latitud": incidencia.latitud,
        "longitud": incidencia.longitud,
        "tiene_foto": bool(incidencia.foto),
        "resumen_ia": incidencia.resumen_ia,
        "personal_id": incidencia.personal_id,
        "responsable": responsable["nombre"] if responsable else None,
        "responsable_especialidad": (
            responsable["especialidad"] if responsable else None
        ),
        "fecha_creacion": formatear_fecha(incidencia.fecha_creacion),
        "fecha_actualizacion": formatear_fecha(incidencia.fecha_actualizacion),
        "puede_eliminar": puede_eliminarse(incidencia)
    }


def puede_eliminarse(incidencia):
    """
    El ciudadano solo puede retirar su reporte mientras nadie lo ha revisado.
    Cuando el administrador lo gestiona, se vuelve un asunto de interés común.
    """
    return (
        incidencia.estado == "Pendiente"
        and (incidencia.avance or "Reporte recibido") == "Reporte recibido"
        and incidencia.personal_id is None
    )


def serializar_historial(registro):
    return {
        "id": registro.id,
        "incidencia_id": registro.incidencia_id,
        "fecha": formatear_fecha(registro.fecha),
        "usuario": registro.usuario,
        "rol": registro.rol,
        "accion": registro.accion,
        "detalle": registro.detalle
    }


def registrar_historial(incidencia_id, accion, detalle=None):
    db.session.add(HistorialIncidencia(
        incidencia_id=incidencia_id,
        usuario=nombre_actor(),
        rol="administrador" if es_administrador() else "ciudadano",
        accion=accion,
        detalle=detalle
    ))


def obtener_incidencia_autorizada(id):
    """
    Devuelve (incidencia, error). El ciudadano solo puede acceder
    a sus propias incidencias; el administrador a todas.
    """
    incidencia = db.session.get(Incidencia, id)

    if incidencia is None:
        return None, (jsonify({"error": "La incidencia no existe"}), 404)

    if es_administrador():
        return incidencia, None

    if incidencia.usuario_id != id_usuario_actual():
        return None, (jsonify({
            "error": "No tienes permiso para consultar esta incidencia"
        }), 403)

    return incidencia, None


def convertir_coordenada(valor, minimo, maximo):
    if valor in (None, ""):
        return None

    try:
        numero = float(valor)
    except (TypeError, ValueError):
        raise ValueError("Las coordenadas deben ser numéricas")

    if not (minimo <= numero <= maximo):
        raise ValueError("Las coordenadas están fuera de rango")

    return numero


def extension_permitida(nombre_archivo):
    return (
        "." in nombre_archivo
        and nombre_archivo.rsplit(".", 1)[1].lower() in EXTENSIONES_PERMITIDAS
    )


@app.errorhandler(RequestEntityTooLarge)
def archivo_muy_grande(error):
    return jsonify({
        "error": "La fotografía supera el tamaño máximo de 5 MB"
    }), 413


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.route("/")
def inicio():
    return jsonify({
        "mensaje": "API de Incidencias funcionando"
    })


@app.route("/api/incidencias/catalogos", methods=["GET"])
@requiere_autenticacion(roles=["usuario", "administrador"])
def obtener_catalogos():
    return jsonify({
        "categorias": CATEGORIAS,
        "estados": ESTADOS_VALIDOS,
        "prioridades": PRIORIDADES_VALIDAS,
        "etapas": ETAPAS_AVANCE,
        "estado_por_etapa": ESTADO_POR_ETAPA
    }), 200


@app.route("/api/incidencias", methods=["GET"])
@requiere_autenticacion(roles=["usuario", "administrador"])
def obtener_incidencias():

    if es_administrador():
        incidencias = Incidencia.query.order_by(Incidencia.id.desc()).all()

    else:
        usuario_id = id_usuario_actual()

        if usuario_id is None:
            return jsonify({
                "error": "Tu perfil no está registrado en PostgreSQL."
            }), 404

        incidencias = Incidencia.query.filter_by(
            usuario_id=usuario_id
        ).order_by(Incidencia.id.desc()).all()

    usuarios = mapa_usuarios({i.usuario_id for i in incidencias})
    personal = mapa_personal({i.personal_id for i in incidencias if i.personal_id})

    return jsonify([
        serializar_incidencia(i, usuarios, personal) for i in incidencias
    ]), 200


@app.route("/api/incidencias/<int:id>", methods=["GET"])
@requiere_autenticacion(roles=["usuario", "administrador"])
def obtener_incidencia(id):
    incidencia, error = obtener_incidencia_autorizada(id)

    if error:
        return error

    usuarios = mapa_usuarios({incidencia.usuario_id})
    personal = mapa_personal(
        {incidencia.personal_id} if incidencia.personal_id else set()
    )

    historial = HistorialIncidencia.query.filter_by(
        incidencia_id=incidencia.id
    ).order_by(HistorialIncidencia.fecha.asc(), HistorialIncidencia.id.asc()).all()

    datos = serializar_incidencia(incidencia, usuarios, personal)
    datos["historial"] = [serializar_historial(h) for h in historial]

    return jsonify(datos), 200


@app.route("/api/incidencias", methods=["POST"])
@requiere_autenticacion(roles=["usuario"])
def crear_incidencia():
    """
    Acepta JSON o multipart/form-data (este último permite adjuntar la foto
    en el campo "foto").
    """
    if request.content_type and request.content_type.startswith("multipart/form-data"):
        datos = request.form.to_dict()
        archivo = request.files.get("foto")
    else:
        datos = request.get_json(silent=True)
        archivo = None

    if not isinstance(datos, dict):
        return jsonify({
            "error": "Debes enviar los datos en formato JSON o formulario"
        }), 400

    for campo in ["titulo", "descripcion"]:
        if not isinstance(datos.get(campo), str) or not datos[campo].strip():
            return jsonify({
                "error": f"El campo {campo} es obligatorio"
            }), 400

    titulo = datos["titulo"].strip()[:150]
    descripcion = datos["descripcion"].strip()

    categoria_elegida = (datos.get("categoria") or "").strip()

    if categoria_elegida and categoria_elegida not in CATEGORIAS:
        return jsonify({
            "error": "Categoría no válida",
            "categorias_permitidas": CATEGORIAS
        }), 400

    try:
        latitud = convertir_coordenada(datos.get("latitud"), -90, 90)
        longitud = convertir_coordenada(datos.get("longitud"), -180, 180)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    nombre_foto = None

    if archivo and archivo.filename:
        if not extension_permitida(archivo.filename):
            return jsonify({
                "error": "Formato de imagen no permitido. Usa JPG, PNG o WEBP."
            }), 400

        if archivo.mimetype and not archivo.mimetype.startswith("image/"):
            return jsonify({"error": "El archivo debe ser una imagen"}), 400

        extension = archivo.filename.rsplit(".", 1)[1].lower()
        nombre_foto = f"{uuid.uuid4().hex}.{extension}"

    usuario_id = id_usuario_actual()

    if usuario_id is None:
        return jsonify({
            "error": "Tu perfil no está registrado en PostgreSQL. Inicia sesión nuevamente."
        }), 404

    # Inteligencia artificial: prioridad y categoría sugerida
    clasificacion = clasificar_prioridad(titulo, descripcion)
    sugerencia = sugerir_categoria(titulo, descripcion)

    categoria_final = categoria_elegida or sugerencia["categoria"]

    if nombre_foto:
        archivo.save(os.path.join(CARPETA_FOTOS, nombre_foto))

    incidencia = Incidencia(
        usuario_id=usuario_id,
        titulo=titulo,
        descripcion=descripcion,
        categoria=categoria_final,
        categoria_sugerida=sugerencia["categoria"],
        estado="Pendiente",
        avance="Reporte recibido",
        prioridad=clasificacion["prioridad"],
        latitud=latitud,
        longitud=longitud,
        foto=nombre_foto,
        fecha_creacion=datetime.now()
    )

    db.session.add(incidencia)
    db.session.flush()

    registrar_historial(
        incidencia.id,
        "Reporte recibido",
        f"Prioridad asignada automáticamente: {incidencia.prioridad} "
        f"({clasificacion['metodo']}). "
        f"Categoría sugerida por IA: {sugerencia['categoria']} "
        f"({sugerencia['metodo']})."
    )

    db.session.commit()

    return jsonify({
        "mensaje": "Incidencia creada correctamente",
        "id": incidencia.id,
        "usuario_id": incidencia.usuario_id,
        "prioridad": incidencia.prioridad,
        "categoria": incidencia.categoria,
        "categoria_sugerida": incidencia.categoria_sugerida,
        "metodo_clasificacion": clasificacion["metodo"],
        "metodo_categoria": sugerencia["metodo"],
        "tiene_foto": bool(nombre_foto)
    }), 201


@app.route("/api/incidencias/<int:id>", methods=["PATCH"])
@requiere_autenticacion(roles=["administrador"])
def actualizar_incidencia(id):
    incidencia = db.session.get(Incidencia, id)

    if incidencia is None:
        return jsonify({
            "error": "La incidencia no existe"
        }), 404

    datos = request.get_json(silent=True)

    if not isinstance(datos, dict) or not datos:
        return jsonify({
            "error": "Debes indicar al menos un campo para actualizar"
        }), 400

    campos_permitidos = {
        "estado", "prioridad", "categoria", "avance", "personal_id", "comentario"
    }

    if not set(datos).issubset(campos_permitidos):
        return jsonify({
            "error": "Solo se permite actualizar: " + ", ".join(sorted(campos_permitidos))
        }), 400

    cambios = []

    # Validaciones
    if "prioridad" in datos and datos["prioridad"] not in PRIORIDADES_VALIDAS:
        return jsonify({
            "error": "Prioridad no válida",
            "prioridades_permitidas": PRIORIDADES_VALIDAS
        }), 400

    if "estado" in datos and datos["estado"] not in ESTADOS_VALIDOS:
        return jsonify({
            "error": "Estado no válido",
            "estados_permitidos": ESTADOS_VALIDOS
        }), 400

    if "avance" in datos and datos["avance"] not in ETAPAS_AVANCE:
        return jsonify({
            "error": "Etapa de seguimiento no válida",
            "etapas_permitidas": ETAPAS_AVANCE
        }), 400

    if "categoria" in datos and datos["categoria"] not in CATEGORIAS:
        return jsonify({
            "error": "Categoría no válida",
            "categorias_permitidas": CATEGORIAS
        }), 400

    nuevo_personal = incidencia.personal_id
    nombre_responsable = None

    if "personal_id" in datos:
        valor = datos["personal_id"]

        if valor in (None, "", 0, "0"):
            nuevo_personal = None
        else:
            try:
                nuevo_personal = int(valor)
            except (TypeError, ValueError):
                return jsonify({"error": "personal_id debe ser numérico"}), 400

            responsable = mapa_personal({nuevo_personal}).get(nuevo_personal)

            if responsable is None:
                return jsonify({"error": "El personal seleccionado no existe"}), 400

            if not responsable["activo"] and nuevo_personal != incidencia.personal_id:
                return jsonify({
                    "error": "El personal seleccionado no está disponible"
                }), 400

            nombre_responsable = responsable["nombre"]

    # Aplicar cambios
    if "prioridad" in datos and datos["prioridad"] != incidencia.prioridad:
        cambios.append(("Prioridad actualizada",
                        f"{incidencia.prioridad} → {datos['prioridad']}"))
        incidencia.prioridad = datos["prioridad"]

    if "categoria" in datos and datos["categoria"] != incidencia.categoria:
        cambios.append(("Categoría actualizada",
                        f"{incidencia.categoria} → {datos['categoria']}"))
        incidencia.categoria = datos["categoria"]

    if nuevo_personal != incidencia.personal_id:
        if nuevo_personal is None:
            cambios.append(("Responsable removido", "La incidencia quedó sin responsable"))
        else:
            cambios.append(("Personal asignado", f"Responsable: {nombre_responsable}"))
        incidencia.personal_id = nuevo_personal

    comentario = (datos.get("comentario") or "").strip()

    if comentario:
        cambios.append(("Comentario", comentario[:1000]))

    # La etapa de seguimiento determina el estado oficial.
    nueva_etapa = datos.get("avance")

    if nueva_etapa is None and "estado" in datos and datos["estado"] != incidencia.estado:
        nueva_etapa = ETAPA_POR_ESTADO[datos["estado"]]

    # Al asignar personal a un reporte nuevo, avanza automáticamente.
    if (
        nueva_etapa is None
        and incidencia.personal_id
        and nombre_responsable
        and (incidencia.avance or "Reporte recibido") in ("Reporte recibido", "En revisión")
    ):
        nueva_etapa = "Personal asignado"

    # Cualquier gestión del administrador sobre un reporte nuevo lo pasa
    # a "En revisión"; desde ese momento el ciudadano ya no puede eliminarlo.
    if (
        nueva_etapa is None
        and cambios
        and (incidencia.avance or "Reporte recibido") == "Reporte recibido"
    ):
        nueva_etapa = "En revisión"

    if nueva_etapa and nueva_etapa != incidencia.avance:
        cambios.append(("Seguimiento actualizado",
                        f"{incidencia.avance or 'Reporte recibido'} → {nueva_etapa}"))
        incidencia.avance = nueva_etapa

    if incidencia.avance:
        nuevo_estado = ESTADO_POR_ETAPA.get(incidencia.avance, incidencia.estado)

        if nuevo_estado != incidencia.estado:
            cambios.append(("Estado actualizado",
                            f"{incidencia.estado} → {nuevo_estado}"))
            incidencia.estado = nuevo_estado

    if not cambios:
        return jsonify({
            "mensaje": "No hubo cambios que guardar",
            "incidencia": serializar_incidencia(incidencia)
        }), 200

    incidencia.fecha_actualizacion = datetime.now()

    for accion, detalle in cambios:
        registrar_historial(incidencia.id, accion, detalle)

    db.session.commit()

    usuarios = mapa_usuarios({incidencia.usuario_id})
    personal = mapa_personal(
        {incidencia.personal_id} if incidencia.personal_id else set()
    )

    return jsonify({
        "mensaje": "Incidencia actualizada correctamente",
        "cambios": len(cambios),
        "incidencia": serializar_incidencia(incidencia, usuarios, personal)
    }), 200


@app.route("/api/incidencias/<int:id>", methods=["DELETE"])
@requiere_autenticacion(roles=["usuario"])
def eliminar_incidencia(id):
    incidencia, error = obtener_incidencia_autorizada(id)

    if error:
        return error

    if not puede_eliminarse(incidencia):
        return jsonify({
            "error": "El reporte ya está siendo atendido por la municipalidad "
                     "y no puede eliminarse."
        }), 409

    nombre_foto = incidencia.foto

    HistorialIncidencia.query.filter_by(incidencia_id=incidencia.id).delete()
    db.session.delete(incidencia)
    db.session.commit()

    if nombre_foto:
        try:
            os.remove(os.path.join(CARPETA_FOTOS, nombre_foto))
        except OSError:
            pass

    return jsonify({
        "mensaje": "Reporte eliminado correctamente"
    }), 200


@app.route("/api/incidencias/<int:id>/foto", methods=["GET"])
@requiere_autenticacion(roles=["usuario", "administrador"])
def obtener_foto(id):
    incidencia, error = obtener_incidencia_autorizada(id)

    if error:
        return error

    if not incidencia.foto:
        return jsonify({"error": "La incidencia no tiene fotografía"}), 404

    ruta = os.path.join(CARPETA_FOTOS, incidencia.foto)

    if not os.path.isfile(ruta):
        return jsonify({"error": "No se encontró el archivo de la fotografía"}), 404

    return send_from_directory(CARPETA_FOTOS, incidencia.foto)


@app.route("/api/incidencias/<int:id>/historial", methods=["GET"])
@requiere_autenticacion(roles=["usuario", "administrador"])
def obtener_historial_incidencia(id):
    incidencia, error = obtener_incidencia_autorizada(id)

    if error:
        return error

    historial = HistorialIncidencia.query.filter_by(
        incidencia_id=incidencia.id
    ).order_by(HistorialIncidencia.fecha.asc(), HistorialIncidencia.id.asc()).all()

    return jsonify([serializar_historial(h) for h in historial]), 200


@app.route("/api/incidencias/historial", methods=["GET"])
@requiere_autenticacion(roles=["administrador"])
def obtener_historial_general():
    limite = min(request.args.get("limite", 100, type=int) or 100, 500)

    registros = db.session.query(HistorialIncidencia, Incidencia.titulo).join(
        Incidencia, Incidencia.id == HistorialIncidencia.incidencia_id
    ).order_by(
        HistorialIncidencia.fecha.desc(), HistorialIncidencia.id.desc()
    ).limit(limite).all()

    resultado = []

    for registro, titulo in registros:
        datos = serializar_historial(registro)
        datos["titulo_incidencia"] = titulo
        resultado.append(datos)

    return jsonify(resultado), 200


@app.route("/api/incidencias/<int:id>/resumen", methods=["POST"])
@requiere_autenticacion(roles=["administrador"])
def generar_resumen_incidencia(id):
    incidencia = db.session.get(Incidencia, id)

    if incidencia is None:
        return jsonify({"error": "La incidencia no existe"}), 404

    resultado = generar_resumen(
        incidencia.titulo,
        incidencia.descripcion,
        incidencia.categoria,
        incidencia.prioridad
    )

    incidencia.resumen_ia = resultado["resumen"]

    registrar_historial(
        incidencia.id,
        "Resumen generado",
        f"Método: {resultado['metodo']}"
    )

    db.session.commit()

    return jsonify({
        "mensaje": "Resumen generado correctamente",
        "resumen": resultado["resumen"],
        "metodo": resultado["metodo"]
    }), 200


@app.route("/api/incidencias/sugerir-categoria", methods=["POST"])
@requiere_autenticacion(roles=["usuario", "administrador"])
def sugerir_categoria_endpoint():
    datos = request.get_json(silent=True) or {}

    titulo = (datos.get("titulo") or "").strip()
    descripcion = (datos.get("descripcion") or "").strip()

    if not titulo and not descripcion:
        return jsonify({"error": "Escribe un título o una descripción"}), 400

    return jsonify(sugerir_categoria(titulo, descripcion)), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True)
