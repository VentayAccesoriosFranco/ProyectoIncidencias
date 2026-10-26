import {
    configurarKeycloak,
    cerrarSesion,
    obtenerRolUsuario,
    obtenerKeycloak
} from "./keycloak.js";

import {
    peticionAutenticada,
    sincronizarPerfil
} from "./api.js";

import {
    crearElemento,
    crearEtiqueta,
    crearEtiquetaPrioridad,
    crearProgreso,
    crearLineaTiempo,
    formatearFecha,
    fechaRelativa,
    iconoCategoria,
    mostrarFoto,
    mostrarUbicacion,
    crearMapa,
    abrirModal,
    configurarModal,
    notificar,
    configurarNavegacion,
    iniciales,
    DESCRIPCION_ETAPA
} from "./comun.js";

let incidencias = [];
let mapaRegistro = null;
let marcadorRegistro = null;
let ubicacion = null;
let fotoSeleccionada = null;
let mapaDetalle = null;

const TAMANO_MAXIMO_FOTO = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Inicio del panel
// ---------------------------------------------------------------------------

async function iniciarPanelCiudadano() {

    try {
        const autenticado = await configurarKeycloak();

        if (!autenticado || obtenerRolUsuario() !== "usuario") {
            window.location.replace("../index.html");
            return;
        }
    } catch (error) {
        console.error("Error al verificar la sesión:", error);
        window.location.replace("../index.html");
        return;
    }

    const usuario = obtenerKeycloak().tokenParsed;
    const nombre = usuario.name || usuario.preferred_username || "Ciudadano";

    document.getElementById("nombreUsuario").textContent = nombre;
    document.getElementById("avatarUsuario").textContent = iniciales(nombre);
    document.getElementById("saludo").textContent =
        "Hola, " + (usuario.given_name || nombre.split(" ")[0]) + " 👋";

    document.getElementById("btnCerrarSesion").addEventListener("click", cerrarSesion);

    document.getElementById("cargaPagina").hidden = true;
    document.getElementById("panelCiudadano").hidden = false;

    configurarNavegacion(["inicio", "nueva", "reportes"], "inicio", vista => {
        if (vista === "nueva") {
            prepararMapaRegistro();
        }
    });

    configurarModal("modalDetalle");

    // El perfil debe existir en PostgreSQL antes de registrar incidencias.
    try {
        await sincronizarPerfil();
    } catch (error) {
        console.error("Error al sincronizar perfil:", error);

        const mensaje = document.getElementById("mensajePerfil");
        mensaje.textContent =
            "No se pudo sincronizar tu perfil (" + error.message + "). " +
            "Comprueba que la API de Usuarios esté encendida.";
        mensaje.hidden = false;

        document.getElementById("btnCrearIncidencia").disabled = true;
    }

    await cargarIncidencias();
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

async function cargarIncidencias() {

    const mensaje = document.getElementById("mensajeListado");

    try {
        const datos = await peticionAutenticada("/api/incidencias");

        if (!Array.isArray(datos)) {
            throw new Error("La API no devolvió una lista de incidencias.");
        }

        incidencias = datos;

        actualizarInicio();
        mostrarReportes();

    } catch (error) {
        console.error("Error al cargar incidencias:", error);
        mensaje.textContent = "No se pudieron cargar tus reportes: " + error.message;
        document.getElementById("ultimoReporte").textContent =
            "No se pudieron cargar tus reportes.";
    }
}

function actualizarInicio() {

    const contar = estado => incidencias.filter(i => i.estado === estado).length;

    document.getElementById("totalReportes").textContent = incidencias.length;
    document.getElementById("totalPendientes").textContent = contar("Pendiente");
    document.getElementById("totalProceso").textContent = contar("En proceso");
    document.getElementById("totalResueltos").textContent = contar("Resuelto");

    const activos = incidencias.filter(i => i.estado !== "Resuelto").length;
    const contador = document.getElementById("contadorReportes");
    contador.textContent = activos;
    contador.hidden = activos === 0;

    const contenedor = document.getElementById("ultimoReporte");
    contenedor.innerHTML = "";

    if (incidencias.length === 0) {
        contenedor.appendChild(crearVacio(
            "📭",
            "Todavía no tienes reportes",
            "Cuando registres una incidencia podrás seguir su avance desde aquí."
        ));
        return;
    }

    contenedor.appendChild(crearTarjetaReporte(incidencias[0], { completo: true }));
}

// ---------------------------------------------------------------------------
// Mis reportes
// ---------------------------------------------------------------------------

function crearVacio(icono, titulo, texto) {
    const vacio = crearElemento("div", "vacio-grande");
    vacio.append(
        crearElemento("div", "icono", icono),
        crearElemento("h3", "", titulo),
        crearElemento("p", "", texto)
    );
    return vacio;
}

function crearTarjetaReporte(incidencia, opciones = {}) {

    const tarjeta = crearElemento("article", opciones.completo ? "" : "reporte");

    if (opciones.completo) {
        tarjeta.style.display = "grid";
        tarjeta.style.gap = "16px";
    }

    // Cabecera
    const cabecera = crearElemento("div", "reporte-cabecera");

    const titulo = crearElemento("div", "reporte-titulo");
    const textos = crearElemento("div");
    textos.appendChild(crearElemento("h3", "", incidencia.titulo));

    const meta = crearElemento("div", "reporte-meta");
    meta.append(
        crearElemento("span", "", "#" + incidencia.id),
        crearElemento("span", "", incidencia.categoria),
        crearElemento("span", "", "Reportado " + fechaRelativa(incidencia.fecha_creacion))
    );
    textos.appendChild(meta);

    titulo.append(
        crearElemento("div", "icono-categoria", iconoCategoria(incidencia.categoria)),
        textos
    );

    const etiquetas = crearElemento("div", "reporte-etiquetas");
    etiquetas.append(
        crearEtiqueta(incidencia.estado, "estado"),
        crearEtiquetaPrioridad(incidencia.prioridad)
    );

    cabecera.append(titulo, etiquetas);

    // Progreso
    const progreso = crearProgreso(incidencia.avance, !opciones.completo);

    // Pie
    const pie = crearElemento("div", "reporte-pie");

    const estadoTexto = crearElemento("span");
    estadoTexto.append(
        crearElemento("strong", "", incidencia.avance + ": "),
        document.createTextNode(DESCRIPCION_ETAPA[incidencia.avance] || "")
    );

    if (incidencia.responsable) {
        estadoTexto.append(
            document.createTextNode(" · Responsable: "),
            crearElemento("strong", "", incidencia.responsable)
        );
    }

    const acciones = crearElemento("div", "acciones-fila");

    // Solo se puede eliminar mientras el reporte no haya sido revisado.
    if (incidencia.puede_eliminar) {
        const botonEliminar = crearElemento("button", "boton boton-peligro boton-pequeno", "Eliminar");
        botonEliminar.type = "button";
        botonEliminar.title = "Puedes eliminarlo mientras la municipalidad no lo haya revisado";
        botonEliminar.addEventListener("click", () => eliminarReporte(incidencia));
        acciones.appendChild(botonEliminar);
    }

    const boton = crearElemento("button", "boton boton-secundario boton-pequeno", "Ver detalle");
    boton.type = "button";
    boton.addEventListener("click", () => abrirDetalle(incidencia.id));
    acciones.appendChild(boton);

    pie.append(estadoTexto, acciones);

    tarjeta.append(cabecera, progreso, pie);

    return tarjeta;
}

function filtrarIncidencias() {

    const estado = document.getElementById("filtroEstado").value;
    const categoria = document.getElementById("filtroCategoria").value;
    const texto = document.getElementById("filtroTitulo").value.toLowerCase().trim();

    return incidencias.filter(i =>
        (!estado || i.estado === estado) &&
        (!categoria || i.categoria === categoria) &&
        (!texto || (i.titulo || "").toLowerCase().includes(texto))
    );
}

function mostrarReportes() {

    const lista = document.getElementById("listaReportes");
    const mensaje = document.getElementById("mensajeListado");

    const filtradas = filtrarIncidencias();

    lista.innerHTML = "";

    if (incidencias.length === 0) {
        const vacio = crearVacio(
            "📭",
            "No tienes reportes registrados",
            "Registra tu primera incidencia para darle seguimiento."
        );
        const enlace = crearElemento("a", "boton boton-primario", "Reportar incidencia");
        enlace.href = "#nueva";
        vacio.appendChild(enlace);
        lista.appendChild(vacio);
        mensaje.textContent = "";
        return;
    }

    if (filtradas.length === 0) {
        lista.appendChild(crearVacio("🔍", "Sin resultados", "Ningún reporte coincide con los filtros."));
    }

    filtradas.forEach(incidencia => {
        lista.appendChild(crearTarjetaReporte(incidencia));
    });

    mensaje.textContent = `Mostrando ${filtradas.length} de ${incidencias.length} reportes`;
}

async function eliminarReporte(incidencia) {

    const confirmado = window.confirm(
        `¿Eliminar el reporte #${incidencia.id} «${incidencia.titulo}»?\n\n` +
        "Solo puedes eliminarlo mientras la municipalidad no lo haya revisado. " +
        "Esta acción no se puede deshacer."
    );

    if (!confirmado) {
        return;
    }

    try {
        await peticionAutenticada(`/api/incidencias/${incidencia.id}`, {
            method: "DELETE"
        });

        notificar("Reporte #" + incidencia.id + " eliminado");

    } catch (error) {
        notificar(error.message, "error");
    }

    await cargarIncidencias();
}

// ---------------------------------------------------------------------------
// Detalle del reporte
// ---------------------------------------------------------------------------

async function abrirDetalle(id) {

    abrirModal("modalDetalle");

    document.getElementById("detalleTitulo").textContent = "Cargando reporte...";
    document.getElementById("detalleMeta").textContent = "";
    document.getElementById("detalleProgreso").innerHTML = "";
    document.getElementById("detalleHistorial").innerHTML = "";

    try {
        const incidencia = await peticionAutenticada(`/api/incidencias/${id}`);

        document.getElementById("detalleTitulo").textContent = incidencia.titulo;

        const meta = document.getElementById("detalleMeta");
        meta.innerHTML = "";
        meta.append(
            crearElemento("span", "", "Reporte #" + incidencia.id),
            crearElemento("span", "", "Registrado el " + formatearFecha(incidencia.fecha_creacion))
        );

        const etiquetas = document.getElementById("detalleEtiquetas");
        etiquetas.innerHTML = "";
        etiquetas.append(
            crearEtiqueta(incidencia.estado, "estado"),
            crearEtiquetaPrioridad(incidencia.prioridad)
        );

        document.getElementById("detalleProgreso").appendChild(
            crearProgreso(incidencia.avance)
        );

        document.getElementById("detalleDescripcion").textContent = incidencia.descripcion;

        const datos = document.getElementById("detalleDatos");
        datos.innerHTML = "";

        const agregarDato = (titulo, valor) => {
            const grupo = crearElemento("div");
            grupo.append(crearElemento("dt", "", titulo), crearElemento("dd", "", valor));
            datos.appendChild(grupo);
        };

        agregarDato("Categoría", incidencia.categoria);
        agregarDato("Responsable", incidencia.responsable || "Pendiente de asignar");
        agregarDato(
            "¿Se puede eliminar?",
            incidencia.puede_eliminar
                ? "Sí, aún no ha sido revisado"
                : "No, ya está siendo atendido"
        );
        agregarDato("Última actualización", formatearFecha(
            incidencia.fecha_actualizacion || incidencia.fecha_creacion
        ));

        document.getElementById("detalleHistorial").appendChild(
            crearLineaTiempo(incidencia.historial, { mostrarUsuario: false })
        );

        mostrarFoto(document.getElementById("detalleFoto"), incidencia);

        if (mapaDetalle) {
            mapaDetalle.remove();
            mapaDetalle = null;
        }

        mapaDetalle = mostrarUbicacion(document.getElementById("detalleMapa"), incidencia);

    } catch (error) {
        document.getElementById("detalleTitulo").textContent = "No se pudo cargar el reporte";
        document.getElementById("detalleMeta").textContent = error.message;
    }
}

// ---------------------------------------------------------------------------
// Registro de incidencias: mapa
// ---------------------------------------------------------------------------

function prepararMapaRegistro() {

    if (mapaRegistro) {
        setTimeout(() => mapaRegistro.invalidateSize(), 100);
        return;
    }

    mapaRegistro = crearMapa(document.getElementById("mapaRegistro"));

    if (!mapaRegistro) {
        return;
    }

    mapaRegistro.on("click", evento => {
        establecerUbicacion(evento.latlng.lat, evento.latlng.lng);
    });

    setTimeout(() => mapaRegistro.invalidateSize(), 100);
}

function establecerUbicacion(lat, lng, centrar = false) {

    ubicacion = {
        latitud: Number(lat.toFixed(6)),
        longitud: Number(lng.toFixed(6))
    };

    if (mapaRegistro) {
        if (marcadorRegistro) {
            marcadorRegistro.setLatLng([lat, lng]);
        } else {
            marcadorRegistro = L.marker([lat, lng], { draggable: true }).addTo(mapaRegistro);
            marcadorRegistro.on("dragend", () => {
                const posicion = marcadorRegistro.getLatLng();
                establecerUbicacion(posicion.lat, posicion.lng);
            });
        }

        if (centrar) {
            mapaRegistro.setView([lat, lng], 17);
        }
    }

    document.getElementById("textoCoordenadas").textContent =
        `📍 ${ubicacion.latitud}, ${ubicacion.longitud}`;
    document.getElementById("btnLimpiarUbicacion").hidden = false;
}

function limpiarUbicacion() {
    ubicacion = null;

    if (marcadorRegistro) {
        marcadorRegistro.remove();
        marcadorRegistro = null;
    }

    document.getElementById("textoCoordenadas").textContent = "Sin ubicación seleccionada";
    document.getElementById("btnLimpiarUbicacion").hidden = true;
}

function usarMiUbicacion() {

    if (!navigator.geolocation) {
        notificar("Tu navegador no permite obtener la ubicación.", "error");
        return;
    }

    const boton = document.getElementById("btnMiUbicacion");
    boton.disabled = true;
    boton.textContent = "Buscando...";

    navigator.geolocation.getCurrentPosition(
        posicion => {
            establecerUbicacion(posicion.coords.latitude, posicion.coords.longitude, true);
            boton.disabled = false;
            boton.textContent = "📍 Usar mi ubicación";
        },
        () => {
            notificar("No fue posible obtener tu ubicación. Márcala en el mapa.", "error");
            boton.disabled = false;
            boton.textContent = "📍 Usar mi ubicación";
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// ---------------------------------------------------------------------------
// Registro de incidencias: fotografía
// ---------------------------------------------------------------------------

function seleccionarFoto(archivo) {

    if (!archivo) {
        return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(archivo.type)) {
        notificar("Formato no permitido. Usa JPG, PNG o WEBP.", "error");
        quitarFoto();
        return;
    }

    if (archivo.size > TAMANO_MAXIMO_FOTO) {
        notificar("La fotografía supera los 5 MB.", "error");
        quitarFoto();
        return;
    }

    fotoSeleccionada = archivo;

    const lector = new FileReader();
    lector.onload = () => {
        document.getElementById("imagenPrevia").src = lector.result;
    };
    lector.readAsDataURL(archivo);

    document.getElementById("nombreFoto").textContent = archivo.name;
    document.getElementById("tamanoFoto").textContent =
        (archivo.size / 1024 / 1024).toFixed(2) + " MB";

    document.getElementById("zonaFoto").hidden = true;
    document.getElementById("vistaPreviaFoto").hidden = false;
}

function quitarFoto() {
    fotoSeleccionada = null;
    document.getElementById("fotoIncidencia").value = "";
    document.getElementById("zonaFoto").hidden = false;
    document.getElementById("vistaPreviaFoto").hidden = true;
}

// ---------------------------------------------------------------------------
// Registro de incidencias: IA y envío
// ---------------------------------------------------------------------------

async function sugerirCategoria() {

    const titulo = document.getElementById("tituloIncidencia").value.trim();
    const descripcion = document.getElementById("descripcionIncidencia").value.trim();
    const texto = document.getElementById("textoSugerencia");
    const boton = document.getElementById("btnSugerirCategoria");

    if (!titulo && !descripcion) {
        texto.textContent = "Escribe primero el título o la descripción.";
        return;
    }

    boton.disabled = true;
    texto.textContent = "Analizando...";

    try {
        const datos = await peticionAutenticada("/api/incidencias/sugerir-categoria", {
            method: "POST",
            body: JSON.stringify({ titulo, descripcion })
        });

        document.getElementById("categoriaIncidencia").value = datos.categoria;
        texto.textContent = `Sugerencia: ${datos.categoria} (${datos.metodo})`;

    } catch (error) {
        texto.textContent = "No se pudo obtener una sugerencia: " + error.message;
    } finally {
        boton.disabled = false;
    }
}

async function registrarIncidencia(evento) {

    evento.preventDefault();

    const error = document.getElementById("errorRegistro");
    const boton = document.getElementById("btnCrearIncidencia");

    const titulo = document.getElementById("tituloIncidencia").value.trim();
    const descripcion = document.getElementById("descripcionIncidencia").value.trim();
    const categoria = document.getElementById("categoriaIncidencia").value;

    error.hidden = true;

    if (!titulo || !descripcion) {
        error.textContent = "El título y la descripción son obligatorios.";
        error.hidden = false;
        return;
    }

    const formulario = new FormData();
    formulario.append("titulo", titulo);
    formulario.append("descripcion", descripcion);
    formulario.append("categoria", categoria);

    if (ubicacion) {
        formulario.append("latitud", ubicacion.latitud);
        formulario.append("longitud", ubicacion.longitud);
    }

    if (fotoSeleccionada) {
        formulario.append("foto", fotoSeleccionada);
    }

    boton.disabled = true;
    boton.innerHTML = '<span class="cargador"></span> Analizando y enviando...';

    try {
        const datos = await peticionAutenticada("/api/incidencias", {
            method: "POST",
            body: formulario
        });

        mostrarResultadoRegistro(datos);

        document.getElementById("formIncidencia").reset();
        document.getElementById("textoSugerencia").textContent = "";
        quitarFoto();
        limpiarUbicacion();

        notificar("¡Reporte #" + datos.id + " enviado correctamente!");

        await cargarIncidencias();

    } catch (fallo) {
        console.error("Error al registrar incidencia:", fallo);
        error.textContent = "No fue posible registrar la incidencia: " + fallo.message;
        error.hidden = false;

    } finally {
        boton.disabled = false;
        boton.textContent = "Enviar reporte";
    }
}

function mostrarResultadoRegistro(datos) {

    const caja = document.getElementById("resultadoRegistro");
    caja.innerHTML = "";

    caja.appendChild(crearElemento("h3", "", "✅ Reporte #" + datos.id + " registrado"));
    caja.appendChild(crearElemento(
        "p", "",
        "La municipalidad revisará tu reporte. Puedes seguir su avance en «Mis reportes»."
    ));

    const lista = crearElemento("dl");

    const agregar = (titulo, valor) => {
        const grupo = crearElemento("div");
        grupo.append(crearElemento("dt", "", titulo), crearElemento("dd", "", valor));
        lista.appendChild(grupo);
    };

    agregar("Prioridad asignada", datos.prioridad);
    agregar("Método", datos.metodo_clasificacion);
    agregar("Categoría", datos.categoria);
    agregar("Fotografía", datos.tiene_foto ? "Adjuntada" : "Sin fotografía");

    caja.appendChild(lista);

    const acciones = crearElemento("div");
    const ver = crearElemento("button", "boton boton-oscuro boton-pequeno", "Ver seguimiento");
    ver.type = "button";
    ver.addEventListener("click", () => {
        caja.hidden = true;
        abrirDetalle(datos.id);
    });

    const otro = crearElemento("button", "boton boton-texto boton-pequeno", "Registrar otro");
    otro.type = "button";
    otro.addEventListener("click", () => {
        caja.hidden = true;
    });

    acciones.append(ver, otro);
    caja.appendChild(acciones);

    caja.hidden = false;
    caja.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

document.getElementById("formIncidencia").addEventListener("submit", registrarIncidencia);
document.getElementById("btnSugerirCategoria").addEventListener("click", sugerirCategoria);
document.getElementById("btnMiUbicacion").addEventListener("click", usarMiUbicacion);
document.getElementById("btnLimpiarUbicacion").addEventListener("click", limpiarUbicacion);
document.getElementById("btnQuitarFoto").addEventListener("click", quitarFoto);
document.getElementById("btnActualizar").addEventListener("click", async () => {
    await cargarIncidencias();
    notificar("Reportes actualizados", "info");
});

const inputFoto = document.getElementById("fotoIncidencia");
const zonaFoto = document.getElementById("zonaFoto");

inputFoto.addEventListener("change", () => seleccionarFoto(inputFoto.files[0]));

["dragenter", "dragover"].forEach(tipo =>
    zonaFoto.addEventListener(tipo, () => zonaFoto.classList.add("arrastrando"))
);

["dragleave", "drop"].forEach(tipo =>
    zonaFoto.addEventListener(tipo, () => zonaFoto.classList.remove("arrastrando"))
);

["filtroEstado", "filtroCategoria"].forEach(id =>
    document.getElementById(id).addEventListener("change", mostrarReportes)
);

document.getElementById("filtroTitulo").addEventListener("input", mostrarReportes);

iniciarPanelCiudadano();
