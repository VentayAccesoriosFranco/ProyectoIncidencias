from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
from seguridad import requiere_autenticacion
import os

load_dotenv()

app = Flask(__name__)
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": ["http://127.0.0.1:5500"],
            "allow_headers": ["Authorization", "Content-Type"],
            "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
        }
    }
)

app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)


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


with app.app_context():
    db.create_all()


@app.route("/")
def inicio():
    return jsonify({
        "mensaje": "API de Incidencias funcionando"
    })


@app.route("/api/incidencias", methods=["GET"])
@requiere_autenticacion(roles=["usuario", "administrador"])
def obtener_incidencias():
    incidencias = Incidencia.query.all()

    resultado = []

    for incidencia in incidencias:
        resultado.append({
            "id": incidencia.id,
            "usuario_id": incidencia.usuario_id,
            "titulo": incidencia.titulo,
            "descripcion": incidencia.descripcion,
            "categoria": incidencia.categoria,
            "estado": incidencia.estado,
            "prioridad": incidencia.prioridad,
            "latitud": incidencia.latitud,
            "longitud": incidencia.longitud
        })

    return jsonify(resultado)


@app.route("/api/incidencias", methods=["POST"])
@requiere_autenticacion(roles=["usuario", "administrador"])
def crear_incidencia():
    datos = request.get_json()

    incidencia = Incidencia(
        usuario_id=datos["usuario_id"],
        titulo=datos["titulo"],
        descripcion=datos["descripcion"],
        categoria=datos["categoria"],
        estado="Pendiente",
        prioridad="Media",
        latitud=datos.get("latitud"),
        longitud=datos.get("longitud")
    )

    db.session.add(incidencia)
    db.session.commit()

    return jsonify({
        "mensaje": "Incidencia creada correctamente",
        "id": incidencia.id
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

    if not isinstance(datos, dict):
        return jsonify({
            "error": "Debes enviar datos en formato JSON"
        }), 400

    if not datos:
        return jsonify({
            "error": "Debes indicar al menos un campo para actualizar"
        }), 400

    campos_permitidos = {"estado", "prioridad"}

    if not set(datos).issubset(campos_permitidos):
        return jsonify({
            "error": "Solo se permite actualizar estado y prioridad"
        }), 400

    estados_validos = ["Pendiente", "En proceso", "Resuelto"]
    prioridades_validas = ["Baja", "Media", "Alta"]

    if "estado" in datos:
        if datos["estado"] not in estados_validos:
            return jsonify({
                "error": "Estado no válido",
                "estados_permitidos": estados_validos
            }), 400

        incidencia.estado = datos["estado"]

    if "prioridad" in datos:
        if datos["prioridad"] not in prioridades_validas:
            return jsonify({
                "error": "Prioridad no válida",
                "prioridades_permitidas": prioridades_validas
            }), 400

        incidencia.prioridad = datos["prioridad"]

    db.session.commit()

    return jsonify({
        "mensaje": "Incidencia actualizada correctamente",
        "incidencia": {
            "id": incidencia.id,
            "titulo": incidencia.titulo,
            "estado": incidencia.estado,
            "prioridad": incidencia.prioridad
        }
    }), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True)