import {
    configurarKeycloak,
    cerrarSesion,
    obtenerRolUsuario
} from "./keycloak.js";

async function iniciarPanelCiudadano() {
    const boton = document.getElementById("btnCerrarSesion");

    try {
        const autenticado = await configurarKeycloak();

        if (!autenticado) {
            window.location.replace("../index.html");
            return;
        }

        if (obtenerRolUsuario() !== "usuario") {
            window.location.replace("../index.html");
            return;
        }

        boton.hidden = false;
        boton.addEventListener("click", cerrarSesion);

    } catch (error) {
        console.error("Error al verificar sesión:", error);
        window.location.replace("../index.html");
    }
}

iniciarPanelCiudadano();