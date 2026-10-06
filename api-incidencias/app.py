from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
CORS(app)

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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True)