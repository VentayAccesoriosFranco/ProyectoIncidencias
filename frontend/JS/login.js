import {
    configurarKeycloak,
    iniciarSesion,
    cerrarSesion,
    obtenerRolUsuario
} from "./keycloak.js";

const estadoSesion = document.getElementById("estadoSesion");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const mensajeAcceso = document.getElementById("mensajeAcceso");

btnLogin.addEventListener("click", iniciarSesion);
btnLogout.addEventListener("click", cerrarSesion);

async function iniciarAplicacion() {

    try {

        const autenticado = await configurarKeycloak();

        if (!autenticado) {

            estadoSesion.textContent = "Inicia sesión para continuar.";

            btnLogin.hidden = false;
            btnLogout.hidden = true;

            return;
        }

        estadoSesion.textContent = "Sesión iniciada correctamente.";

        btnLogin.hidden = true;
        btnLogout.hidden = false;

        const rol = obtenerRolUsuario();

        if (rol === "administrador") {

            window.location.replace(
                "pages/administrador.html"
            );

        } else if (rol === "usuario") {

            window.location.replace(
                "pages/ciudadano.html"
            );

        } else {

            mensajeAcceso.textContent =
                "Tu cuenta no tiene un rol autorizado para acceder al sistema.";

        }

    } catch (error) {

        console.error("Error al iniciar sesión:", error);

        estadoSesion.textContent =
            "No fue posible comprobar la sesión.";

        btnLogin.hidden = false;
    }
}

iniciarAplicacion();