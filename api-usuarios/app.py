from flask import Flask, jsonify, request, g
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
from sqlalchemy import text
from seguridad import requiere_autenticacion
from datetime import datetime
import os


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

db = SQLAlchemy(app)


class Usuario(db.Model):
    __tablename__ = "usuarios"

    id = db.Column(db.Integer, primary_key=True)

    keycloak_id = db.Column(
        db.String(100),
        unique=True,
        nullable=True
    )

    nombre = db.Column(db.String(100), nullable=False)

    correo = db.Column(
        db.String(150),
        unique=True,
        nullable=False
    )

    rol = db.Column(
        db.String(30),
        nullable=False,
        default="usuario"
    )


class Personal(db.Model):
    """
    Catálogo de trabajadores o cuadrillas que el administrador
    puede asignar a una incidencia.
    """
    __tablename__ = "personal"

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(120), nullable=False)
    especialidad = db.Column(db.String(80), nullable=False)
    telefono = db.Column(db.String(30))
    activo = db.Column(db.Boolean, nullable=False, default=True)
    fecha_registro = db.Column(db.DateTime, default=datetime.now)


PERSONAL_INICIAL = [
    ("Carlos López - Cuadrilla de mantenimiento", "Infraestructura", "5555-1001"),
    ("Ana Morales - Cuadrilla eléctrica", "Alumbrado público", "5555-1002"),
    ("José Pérez - Cuadrilla de fontanería", "Fuga de agua", "5555-1003"),
    ("María García - Cuadrilla de obras viales", "Calles dañadas", "5555-1004"),
    ("Luis Hernández - Servicios generales", "Otros", "5555-1005"),
    ("Cuerpo de Bomberos - Unidad de emergencias", "Incendios", "122")
]


with app.app_context():
    db.create_all()

    # Datos iniciales para que el administrador pueda asignar desde el inicio.
    if Personal.query.count() == 0:
        for nombre, especialidad, telefono in PERSONAL_INICIAL:
            db.session.add(Personal(
                nombre=nombre,
                especialidad=especialidad,
                telefono=telefono
            ))

    # La categoría Incendios se agregó después: si aún no hay personal
    # para ella, se registra la unidad de bomberos.
    elif Personal.query.filter_by(especialidad="Incendios").count() == 0:
        nombre, especialidad, telefono = PERSONAL_INICIAL[-1]
        db.session.add(Personal(
            nombre=nombre,
            especialidad=especialidad,
            telefono=telefono
        ))

    db.session.commit()


def serializar_personal(persona):
    return {
        "id": persona.id,
        "nombre": persona.nombre,
        "especialidad": persona.especialidad,
        "telefono": persona.telefono,
        "activo": persona.activo,
        "fecha_registro": (
            persona.fecha_registro.isoformat(timespec="seconds")
            if persona.fecha_registro else None
        )
    }


@app.route("/")
def inicio():
    return jsonify({
        "mensaje": "API de Usuarios funcionando"
    })


@app.route("/api/usuarios", methods=["GET"])
@requiere_autenticacion(roles=["administrador"])
def obtener_usuarios():
    usuarios = Usuario.query.all()

    resultado = []

    for usuario in usuarios:
        resultado.append({
            "id": usuario.id,
            "nombre": usuario.nombre,
            "correo": usuario.correo,
            "rol": usuario.rol
        })

    return jsonify(resultado)


@app.route("/api/usuarios", methods=["POST"])
@requiere_autenticacion(roles=["administrador"])
def crear_usuario():
    datos = request.get_json()

    usuario = Usuario(
        nombre=datos["nombre"],
        correo=datos["correo"],
        rol=datos.get("rol", "usuario")
    )

    db.session.add(usuario)
    db.session.commit()

    return jsonify({
        "mensaje": "Usuario creado correctamente",
        "id": usuario.id
    }), 201

@app.route("/api/usuarios/mi-perfil", methods=["POST"])
@requiere_autenticacion(roles=["usuario", "administrador"])
def sincronizar_mi_perfil():
    datos_token = g.usuario_autenticado

    keycloak_id = datos_token["sub"]
    nombre = datos_token.get("name") or datos_token.get(
        "preferred_username", "Usuario"
    )
    correo = datos_token.get("email")

    roles = datos_token.get("realm_access", {}).get("roles", [])

    rol = "administrador" if "administrador" in roles else "usuario"

    if not correo:
        return jsonify({
            "error": "Tu cuenta de Keycloak no tiene un correo electrónico"
        }), 400

    usuario = Usuario.query.filter_by(
        keycloak_id=keycloak_id
    ).first()

    if usuario is None:
        usuario = Usuario.query.filter_by(
            correo=correo
        ).first()

        if usuario is not None and usuario.keycloak_id is not None:
            return jsonify({
                "error": "El correo ya está vinculado a otra cuenta"
            }), 409

        if usuario is None:
            usuario = Usuario(
                keycloak_id=keycloak_id,
                nombre=nombre,
                correo=correo,
                rol=rol
            )
            db.session.add(usuario)
        else:
            usuario.keycloak_id = keycloak_id

    usuario.nombre = nombre
    usuario.correo = correo
    usuario.rol = rol

    db.session.commit()

    return jsonify({
        "mensaje": "Perfil sincronizado correctamente",
        "usuario": {
            "id": usuario.id,
            "keycloak_id": usuario.keycloak_id,
            "nombre": usuario.nombre,
            "correo": usuario.correo,
            "rol": usuario.rol
        }
    }), 200


# ---------------------------------------------------------------------------
# Gestión de personal (solo administrador)
# ---------------------------------------------------------------------------

@app.route("/api/usuarios/personal", methods=["GET"])
@requiere_autenticacion(roles=["administrador"])
def listar_personal():
    consulta = Personal.query

    if request.args.get("activos") == "1":
        consulta = consulta.filter_by(activo=True)

    personal = consulta.order_by(Personal.nombre.asc()).all()

    return jsonify([serializar_personal(p) for p in personal]), 200


@app.route("/api/usuarios/personal", methods=["POST"])
@requiere_autenticacion(roles=["administrador"])
def crear_personal():
    datos = request.get_json(silent=True)

    if not isinstance(datos, dict):
        return jsonify({"error": "Debes enviar los datos en formato JSON"}), 400

    nombre = (datos.get("nombre") or "").strip()
    especialidad = (datos.get("especialidad") or "").strip()
    telefono = (datos.get("telefono") or "").strip()

    if not nombre or not especialidad:
        return jsonify({
            "error": "El nombre y la especialidad son obligatorios"
        }), 400

    persona = Personal(
        nombre=nombre[:120],
        especialidad=especialidad[:80],
        telefono=telefono[:30] or None,
        activo=True
    )

    db.session.add(persona)
    db.session.commit()

    return jsonify({
        "mensaje": "Personal registrado correctamente",
        "personal": serializar_personal(persona)
    }), 201


@app.route("/api/usuarios/personal/<int:id>", methods=["PATCH"])
@requiere_autenticacion(roles=["administrador"])
def actualizar_personal(id):
    persona = db.session.get(Personal, id)

    if persona is None:
        return jsonify({"error": "El personal no existe"}), 404

    datos = request.get_json(silent=True)

    if not isinstance(datos, dict) or not datos:
        return jsonify({"error": "Debes indicar al menos un campo"}), 400

    if "nombre" in datos:
        nombre = (datos["nombre"] or "").strip()
        if not nombre:
            return jsonify({"error": "El nombre no puede quedar vacío"}), 400
        persona.nombre = nombre[:120]

    if "especialidad" in datos:
        especialidad = (datos["especialidad"] or "").strip()
        if not especialidad:
            return jsonify({"error": "La especialidad no puede quedar vacía"}), 400
        persona.especialidad = especialidad[:80]

    if "telefono" in datos:
        persona.telefono = ((datos["telefono"] or "").strip()[:30]) or None

    if "activo" in datos:
        persona.activo = bool(datos["activo"])

    db.session.commit()

    return jsonify({
        "mensaje": "Personal actualizado correctamente",
        "personal": serializar_personal(persona)
    }), 200


@app.route("/api/usuarios/personal/<int:id>", methods=["DELETE"])
@requiere_autenticacion(roles=["administrador"])
def eliminar_personal(id):
    persona = db.session.get(Personal, id)

    if persona is None:
        return jsonify({"error": "El personal no existe"}), 404

    # No se elimina a quien tiene incidencias sin resolver asignadas.
    try:
        activas = db.session.execute(
            text("""
                SELECT COUNT(*) FROM incidencias
                WHERE personal_id = :id AND estado <> 'Resuelto'
            """),
            {"id": id}
        ).scalar() or 0
    except Exception:
        db.session.rollback()
        activas = 0

    if activas:
        return jsonify({
            "error": f"{persona.nombre} tiene {activas} incidencia(s) sin resolver. "
                     "Reasígnalas a otra persona antes de eliminarlo, "
                     "o márcalo como no disponible."
        }), 409

    nombre = persona.nombre

    db.session.delete(persona)
    db.session.commit()

    return jsonify({
        "mensaje": f"{nombre} fue eliminado del catálogo"
    }), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)