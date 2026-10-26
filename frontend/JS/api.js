import { obtenerKeycloak } from "./keycloak.js";

// Todas las peticiones pasan por Nginx (proxy inverso).
export const API_URL = "http://localhost:8081";

async function obtenerToken() {

    const keycloak = obtenerKeycloak();

    if (!keycloak.authenticated) {
        throw new Error("Debes iniciar sesión.");
    }

    await keycloak.updateToken(30);

    return keycloak.token;
}

export async function peticionAutenticada(ruta, opciones = {}) {

    const token = await obtenerToken();

    const headers = new Headers(opciones.headers || {});

    headers.set("Authorization", "Bearer " + token);
    headers.set("Accept", "application/json");

    // Con FormData (fotografías) el navegador define el Content-Type.
    const esFormulario = opciones.body instanceof FormData;

    if (opciones.body && !esFormulario && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    let respuesta;

    try {
        respuesta = await fetch(API_URL + ruta, {
            ...opciones,
            headers
        });
    } catch (error) {
        throw new Error(
            "No se pudo conectar con el servidor. Verifica que Nginx y las APIs estén encendidos."
        );
    }

    let datos = null;

    try {
        datos = await respuesta.json();
    } catch (error) {
        datos = null;
    }

    if (!respuesta.ok) {
        throw new Error(
            (datos && datos.error) ||
            `Error HTTP ${respuesta.status}`
        );
    }

    return datos;
}

// Descarga un archivo protegido (fotografía) y devuelve una URL local.
export async function obtenerArchivoProtegido(ruta) {

    const token = await obtenerToken();

    const respuesta = await fetch(API_URL + ruta, {
        headers: {
            Authorization: "Bearer " + token
        }
    });

    if (!respuesta.ok) {
        throw new Error(`Error HTTP ${respuesta.status}`);
    }

    const archivo = await respuesta.blob();

    return URL.createObjectURL(archivo);
}

export async function sincronizarPerfil() {

    const datos = await peticionAutenticada(
        "/api/usuarios/mi-perfil",
        {
            method: "POST"
        }
    );

    return datos;
}
