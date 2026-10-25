
import {
    configurarKeycloak,
    iniciarSesion,
    cerrarSesion,
    obtenerKeycloak
} from "./keycloak.js";

const API_URL = "http://localhost:8081";

window.iniciarSesion = iniciarSesion;
window.cerrarSesion = cerrarSesion;

// Sincroniza el usuario autenticado con PostgreSQL.
async function sincronizarPerfil() {
    const keycloak = obtenerKeycloak();

    if (!keycloak.authenticated) {
        return;
    }

    await keycloak.updateToken(30);

    const respuesta = await fetch(
        `${API_URL}/api/usuarios/mi-perfil`,
        {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + keycloak.token,
                "Content-Type": "application/json"
            }
        }
    );

    const datos = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(
            `HTTP ${respuesta.status}: ` +
            (datos.error || JSON.stringify(datos))
        );
    }

    console.log("Perfil sincronizado:", datos);

    return datos;
}

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
                await cargarTablaIncidencias();

            // Nuevo: registrar o actualizar el perfil en PostgreSQL.
            try {
                const perfil = await sincronizarPerfil();

                console.log(
                    "Usuario registrado en PostgreSQL:",
                    perfil.usuario
                );

            } catch (error) {
                console.error(
                    "No se pudo sincronizar el perfil:",
                    error
                );

                estado.textContent =
                    "Sesión iniciada, pero no se pudo sincronizar el perfil";
            }

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
            `${API_URL}/api/usuarios`,
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
            "No fue posible conectar con API Usuarios a través de Nginx.";
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
            `${API_URL}/api/incidencias`,
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
            "No fue posible conectar con API Incidencias a través de Nginx.";
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
            `${API_URL}/api/incidencias/1`,
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
        console.error("Error API Incidencias:", error);

        resultado.textContent =
            "Error al conectar con API Incidencias a través de Nginx.";
    }
};

// PASO 41: MOSTRAR INCIDENCIAS EN UNA TABLA

async function cargarTablaIncidencias() {

    const cuerpo = document.getElementById("cuerpoTablaIncidencias");
    const mensaje = document.getElementById("mensajeListadoIncidencias");
    const keycloak = obtenerKeycloak();

    if (!cuerpo || !mensaje) {
        return;
    }

    if (!keycloak.authenticated) {
        cuerpo.innerHTML = "";
        mensaje.textContent = "Debes iniciar sesión para consultar las incidencias.";
        return;
    }

    try {

        mensaje.textContent = "Cargando incidencias...";

        await keycloak.updateToken(30);

        const respuesta = await fetch(
            `${API_URL}/api/incidencias`,
            {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + keycloak.token
                }
            }
        );

        if (!respuesta.ok) {
            throw new Error("HTTP " + respuesta.status);
        }

        const incidencias = await respuesta.json();

        cuerpo.innerHTML = "";

        if (incidencias.length === 0) {

            const fila = cuerpo.insertRow();
            const celda = fila.insertCell();

            celda.colSpan = 5;
            celda.textContent = "No hay incidencias registradas.";

            mensaje.textContent = "";
            return;
        }

        incidencias.forEach(incidencia => {

            const fila = cuerpo.insertRow();

            const valores = [
                incidencia.id,
                incidencia.titulo,
                incidencia.categoria,
                incidencia.estado,
                incidencia.prioridad
            ];

            valores.forEach(valor => {
                const celda = fila.insertCell();
                celda.textContent = valor ?? "";
            });

        });

        mensaje.textContent =
            "Total de incidencias: " + incidencias.length;

    } catch (error) {

        console.error("Error al cargar incidencias:", error);

        mensaje.textContent =
            "No se pudieron cargar las incidencias. Revisa que las APIs estén encendidas.";
    }
}

document.getElementById("btnCargarIncidencias")
    ?.addEventListener("click", cargarTablaIncidencias);

iniciarAplicacion();


const formularioIncidencia = document.getElementById("formIncidencia");

if (formularioIncidencia) {
    formularioIncidencia.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        const resultado = document.getElementById(
            "resultadoCrearIncidencia"
        );

        const boton = document.getElementById("btnCrearIncidencia");
        const keycloak = obtenerKeycloak();

        if (!keycloak.authenticated) {
            resultado.textContent =
                "Debes iniciar sesión para registrar una incidencia.";
            return;
        }

        const titulo = document.getElementById(
            "tituloIncidencia"
        ).value.trim();

        const descripcion = document.getElementById(
            "descripcionIncidencia"
        ).value.trim();

        const categoria = document.getElementById(
            "categoriaIncidencia"
        ).value;

        if (!titulo || !descripcion || !categoria) {
            resultado.textContent =
                "Debes completar todos los campos.";
            return;
        }

        boton.disabled = true;
        resultado.textContent = "Registrando incidencia...";

        try {
            await keycloak.updateToken(30);

            const respuesta = await fetch(
                `${API_URL}/api/incidencias`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": "Bearer " + keycloak.token,
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({
                        titulo: titulo,
                        descripcion: descripcion,
                        categoria: categoria
                    })
                }
            );

            const datos = await respuesta.json();

            if (respuesta.status === 201) {
                resultado.textContent =
                    "¡Incidencia registrada correctamente!\n" +
                    "ID de incidencia: " + datos.id + "\n" +
                    "ID del usuario: " + datos.usuario_id;

                formularioIncidencia.reset();
                
                await cargarTablaIncidencias();

            } else {
                resultado.textContent =
                    "HTTP " + respuesta.status + "\n" +
                    (datos.error || JSON.stringify(datos));
            }

        } catch (error) {
            console.error("Error al registrar incidencia:", error);

            resultado.textContent =
                "No fue posible registrar la incidencia. " +
                "Verifica que Nginx y Flask estén encendidos.";

        } finally {
            boton.disabled = false;
        }
    });
}

