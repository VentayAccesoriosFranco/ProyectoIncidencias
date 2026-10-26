import {
    configurarKeycloak,
    iniciarSesion,
    registrarCuenta,
    cerrarSesion,
    obtenerRolUsuario
} from "./keycloak.js";

const estadoSesion = document.getElementById("estadoSesion");
const textoEstado = document.getElementById("textoEstadoSesion");
const acciones = document.getElementById("accionesAcceso");
const btnLogin = document.getElementById("btnLogin");
const btnRegistro = document.getElementById("btnRegistro");
const btnLogout = document.getElementById("btnLogout");

btnLogin.addEventListener("click", iniciarSesion);
btnRegistro.addEventListener("click", registrarCuenta);
btnLogout.addEventListener("click", cerrarSesion);

function mostrarEstado(texto, { cargando = false, error = false } = {}) {
    textoEstado.textContent = texto;
    estadoSesion.classList.toggle("error", error);
    estadoSesion.querySelector(".cargador").hidden = !cargando;
}

async function iniciarAplicacion() {

    try {

        const autenticado = await configurarKeycloak();

        if (!autenticado) {
            estadoSesion.hidden = true;
            acciones.hidden = false;
            return;
        }

        const rol = obtenerRolUsuario();

        if (rol === "administrador") {
            mostrarEstado("Abriendo el panel de administración...", { cargando: true });
            window.location.replace("pages/administrador.html");

        } else if (rol === "usuario") {
            mostrarEstado("Abriendo tu panel de ciudadano...", { cargando: true });
            window.location.replace("pages/ciudadano.html");

        } else {
            mostrarEstado(
                "Tu cuenta no tiene un rol autorizado para acceder al sistema.",
                { error: true }
            );
            btnLogout.hidden = false;
        }

    } catch (error) {

        console.error("Error al iniciar sesión:", error);

        mostrarEstado(
            "No fue posible conectar con Keycloak. Verifica que el servidor esté encendido.",
            { error: true }
        );

        acciones.hidden = false;
    }
}

iniciarAplicacion();
