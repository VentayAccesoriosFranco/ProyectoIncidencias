from flask import Flask, jsonify, request, g
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)