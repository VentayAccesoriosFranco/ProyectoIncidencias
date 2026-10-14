
import {
    configurarKeycloak,
    iniciarSesion,
    cerrarSesion,
    obtenerKeycloak
} from "./keycloak.js";

window.iniciarSesion = iniciarSesion;
window.cerrarSesion = cerrarSesion;

async function iniciarAplicacion() {
    const estado = document.getElementById("estadoSesion");
    const informacion = document.getElementById("informacionUsuario");
    const btnLogin = document.getElementById("btnLogin");
    const btnLogout = document.getElementById("btnLogout");

    try {
        const autenticado = await configurarKeycloak();
        const keycloak = obtenerKeycloak();

        if (autenticado) {
            estado.textContent = "Sesión iniciada correctamente";
            btnLogin.hidden = true;
            btnLogout.hidden = false;

            const usuario = keycloak.tokenParsed;

            informacion.textContent =
                "Usuario: " + (usuario.preferred_username || "") +
                " | Nombre: " + (usuario.name || "") +
                " | Roles: " +
                (usuario.realm_access?.roles || []).join(", ");

        } else {
            estado.textContent = "No has iniciado sesión";
            informacion.textContent = "Inicia sesión para continuar.";
            btnLogin.hidden = false;
            btnLogout.hidden = true;
        }

    } catch (error) {
        console.error(error);
        estado.textContent = "Error al conectar con Keycloak";
    }
}


window.probarUsuarios = async function () {
    const resultado = document.getElementById("resultado");
    const keycloak = obtenerKeycloak();

    if (!keycloak.authenticated) {
        resultado.textContent =
            "Debes iniciar sesión para consultar la API Usuarios.";
        return;
    }

    try {
        await keycloak.updateToken(30);

        const respuesta = await fetch(
            "http://localhost:5001/api/usuarios",
            {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + keycloak.token,
                    "Accept": "application/json"
                }
            }
        );

        const datos = await respuesta.json();

        if (respuesta.status === 200) {
            resultado.textContent =
                "HTTP 200 - Acceso autorizado\n\n" +
                JSON.stringify(datos, null, 2);

        } else if (respuesta.status === 403) {
            resultado.textContent =
                "HTTP 403 - Acceso denegado\n\n" +
                datos.error;

        } else if (respuesta.status === 401) {
            resultado.textContent =
                "HTTP 401 - Token inválido o no autorizado\n\n" +
                datos.error;

        } else {
            resultado.textContent =
                "HTTP " + respuesta.status + "\n\n" +
                JSON.stringify(datos, null, 2);
        }

    } catch (error) {
        console.error("Error API Usuarios:", error);

        resultado.textContent =
            "No fue posible conectar con API Usuarios. " +
            "Revisa que Flask esté ejecutándose.";
    }
};



window.probarIncidencias = async function () {
    const resultado = document.getElementById("resultado");
    const keycloak = obtenerKeycloak();

    if (!keycloak.authenticated) {
        resultado.textContent =
            "Debes iniciar sesión para consultar las incidencias.";
        return;
    }

    try {
        await keycloak.updateToken(30);

        const respuesta = await fetch(
            "http://localhost:5002/api/incidencias",
            {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + keycloak.token,
                    "Accept": "application/json"
                }
            }
        );

        const datos = await respuesta.json();

        if (respuesta.status === 200) {
            resultado.textContent =
                "HTTP 200 - Incidencias consultadas correctamente\n\n" +
                JSON.stringify(datos, null, 2);

        } else if (respuesta.status === 403) {
            resultado.textContent =
                "HTTP 403 - Acceso denegado\n\n" +
                datos.error;

        } else if (respuesta.status === 401) {
            resultado.textContent =
                "HTTP 401 - Token inválido o no autorizado\n\n" +
                datos.error;

        } else {
            resultado.textContent =
                "HTTP " + respuesta.status + "\n\n" +
                JSON.stringify(datos, null, 2);
        }

    } catch (error) {
        console.error("Error API Incidencias:", error);

        resultado.textContent =
            "No fue posible conectar con API Incidencias. " +
            "Comprueba que Flask esté ejecutándose en el puerto 5002.";
    }
};

window.probarActualizarIncidencia = async function () {
    const resultado = document.getElementById("resultado");
    const keycloak = obtenerKeycloak();

    if (!keycloak.authenticated) {
        resultado.textContent = "Debes iniciar sesión primero.";
        return;
    }

    try {
        await keycloak.updateToken(30);

        const respuesta = await fetch(
            "http://localhost:5002/api/incidencias/1",
            {
                method: "PATCH",
                headers: {
                    "Authorization": "Bearer " + keycloak.token,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    estado: "En proceso",
                    prioridad: "Alta"
                })
            }
        );

        const datos = await respuesta.json();

        resultado.textContent =
            "HTTP " + respuesta.status + "\n" +
            JSON.stringify(datos, null, 2);

    } catch (error) {
        console.error(error);
        resultado.textContent =
            "Error al conectar con API Incidencias.";
    }
};


iniciarAplicacion();
