
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
        redirectUri: URL_FRONTEND
    });
}

export function iniciarSesion() {
    return keycloak.login({
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
