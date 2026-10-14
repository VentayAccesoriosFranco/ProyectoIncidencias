from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
from seguridad import requiere_autenticacion
import os


load_dotenv()

app = Flask(__name__)
CORS(app)

app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)


class Usuario(db.Model):
    __tablename__ = "usuarios"

    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    correo = db.Column(db.String(150), unique=True, nullable=False)
    rol = db.Column(db.String(30), nullable=False, default="usuario")


with app.app_context():
    db.create_all()


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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)