
from functools import wraps

import jwt
from jwt import PyJWKClient
from flask import request, jsonify, g

KEYCLOAK_URL = "http://localhost:8080"
REALM = "incidencias"

ISSUER = f"{KEYCLOAK_URL}/realms/{REALM}"
JWKS_URL = f"{ISSUER}/protocol/openid-connect/certs"

API_AUDIENCE = "api-incidencias"

jwks_client = PyJWKClient(JWKS_URL)


def requiere_autenticacion(roles=None):
    def decorador(funcion):
        @wraps(funcion)
        def verificar(*args, **kwargs):

            autorizacion = request.headers.get("Authorization", "")

            if not autorizacion.startswith("Bearer "):
                return jsonify({
                    "error": "Token de autenticación requerido"
                }), 401

            token = autorizacion[7:].strip()

            if not token:
                return jsonify({
                    "error": "Token de autenticación requerido"
                }), 401

            try:
                clave = jwks_client.get_signing_key_from_jwt(token)

                datos = jwt.decode(
                    token,
                    clave.key,
                    algorithms=["RS256"],
                    audience=API_AUDIENCE,
                    issuer=ISSUER,
                    options={
                        "require": ["exp", "iat", "iss", "aud", "sub"]
                    }
                )

            except jwt.PyJWTError:
                return jsonify({
                    "error": "Token inválido o expirado"
                }), 401

            except Exception:
                return jsonify({
                    "error": "No fue posible validar el token"
                }), 503

            roles_usuario = datos.get(
                "realm_access", {}
            ).get("roles", [])

            if roles and not any(
                rol in roles_usuario for rol in roles
            ):
                return jsonify({
                    "error": "No tienes permisos para esta operación"
                }), 403

            g.usuario_autenticado = datos

            return funcion(*args, **kwargs)

        return verificar

    return decorador
