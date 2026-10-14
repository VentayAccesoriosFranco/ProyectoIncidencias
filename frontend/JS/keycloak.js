
import Keycloak from "./vendor/keycloak.js";

const keycloak = new Keycloak({
    url: "http://localhost:8080",
    realm: "incidencias",
    clientId: "frontend-incidencias"
});

export async function configurarKeycloak() {
    return await keycloak.init({
        onLoad: "check-sso",
        pkceMethod: "S256",
        checkLoginIframe: false
    });
}

export function iniciarSesion() {
    return keycloak.login({
        redirectUri: window.location.origin + "/frontend/index.html"
    });
}

export function cerrarSesion() {
    return keycloak.logout({
        redirectUri: window.location.origin + "/frontend/index.html"
    });
}

export function obtenerKeycloak() {
    return keycloak;
}
