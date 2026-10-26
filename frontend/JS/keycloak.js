
import Keycloak from "./vendor/keycloak.js";

const URL_FRONTEND = "http://127.0.0.1:5500/frontend/index.html";

const keycloak = new Keycloak({
    url: "http://localhost:8080",
    realm: "incidencias",
    clientId: "frontend-incidencias"
});

export async function configurarKeycloak() {
    return await keycloak.init({
        onLoad: "check-sso",
        pkceMethod: "S256",
        checkLoginIframe: false,
        redirectUri: window.location.href.split("#")[0]
    });
}

export function iniciarSesion() {
    return keycloak.login({
        redirectUri: URL_FRONTEND
    });
}

// Registro de ciudadanos (requiere "User registration" activo en el realm).
export function registrarCuenta() {
    return keycloak.register({
        redirectUri: URL_FRONTEND
    });
}

export function cerrarSesion() {
    return keycloak.logout({
        redirectUri: URL_FRONTEND
    });
}

export function obtenerKeycloak() {
    return keycloak;
}

// Identificar el rol del usuario autenticado
export function obtenerRolUsuario() {

    if (!keycloak.authenticated || !keycloak.tokenParsed) {
        return null;
    }

    const roles = keycloak.tokenParsed.realm_access?.roles || [];

    if (roles.includes("administrador")) {
        return "administrador";
    }

    if (roles.includes("usuario")) {
        return "usuario";
    }

    return null;
}
