import {
    configurarKeycloak,
    cerrarSesion,
    obtenerRolUsuario,
    obtenerKeycloak
} from "./keycloak.js";

import {
    peticionAutenticada
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
    crearMarcador,
    abrirModal,
    configurarModal,
    notificar,
    configurarNavegacion,
    iniciales,
    CATEGORIAS,
    ESTADO_POR_ETAPA
} from "./comun.js";

let incidencias = [];
let personal = [];
let historialGeneral = [];
let incidenciaActual = null;

let mapaDashboard = null;
let capaMarcadores = null;
let mapaGestion = null;

const ORDEN_PRIORIDAD = { "Alta": 0, "Media": 1, "Baja": 2 };

// ---------------------------------------------------------------------------
// Inicio del panel
// ---------------------------------------------------------------------------

async function iniciarPanelAdministrador() {

    try {
        const autenticado = await configurarKeycloak();

        if (!autenticado || obtenerRolUsuario() !== "administrador") {
            window.location.replace("../index.html");
            return;
        }
    } catch (error) {
        console.error("Error al iniciar panel administrador:", error);
        window.location.replace("../index.html");
        return;
    }

    const usuario = obtenerKeycloak().tokenParsed;
    const nombre = usuario.name || usuario.preferred_username || "Administrador";

    document.getElementById("nombreUsuario").textContent = nombre;
    document.getElementById("avatarUsuario").textContent = iniciales(nombre);
    document.getElementById("btnCerrarSesion").addEventListener("click", cerrarSesion);

    document.getElementById("cargaPagina").hidden = true;
    document.getElementById("panelAdministrador").hidden = false;

    configurarModal("modalGestion");

    configurarNavegacion(
        ["general", "incidencias", "personal", "historial"],
        "general",
        vista => {
            if (vista === "general" && mapaDashboard) {
                setTimeout(() => mapaDashboard.invalidateSize(), 100);
            }
            if (vista === "historial") {
                cargarHistorial();
            }
        }
    );

    // El perfil del administrador también se sincroniza con PostgreSQL.
    peticionAutenticada("/api/usuarios/mi-perfil", { method: "POST" })
        .catch(error => console.warn("No se pudo sincronizar el perfil:", error));

    await Promise.all([cargarPersonal(), cargarIncidencias()]);
}

// ---------------------------------------------------------------------------
// Carga de datos
// ---------------------------------------------------------------------------

async function cargarIncidencias() {

    const mensaje = document.getElementById("mensajeListadoIncidencias");

    try {
        const datos = await peticionAutenticada("/api/incidencias");

        if (!Array.isArray(datos)) {
            throw new Error("La API no devolvió una lista de incidencias.");
        }

        incidencias = datos;

        actualizarDashboard();
        mostrarIncidenciasFiltradas();
        mostrarPersonal();

    } catch (error) {
        console.error("Error al cargar incidencias:", error);
        mensaje.textContent = "No se pudieron cargar las incidencias: " + error.message;
        notificar("No se pudieron cargar las incidencias", "error");
    }
}

async function cargarPersonal() {

    try {
        const datos = await peticionAutenticada("/api/usuarios/personal");
        personal = Array.isArray(datos) ? datos : [];
    } catch (error) {
        console.error("Error al cargar personal:", error);
        personal = [];
        notificar("No se pudo cargar el personal: " + error.message, "error");
    }

    mostrarPersonal();
}

async function cargarHistorial() {

    const lista = document.getElementById("listaHistorial");

    if (historialGeneral.length === 0) {
        lista.innerHTML = "";
        lista.appendChild(crearElemento("p", "texto-suave", "Cargando historial..."));
    }

    try {
        historialGeneral = await peticionAutenticada("/api/incidencias/historial?limite=200");
        mostrarHistorial();
    } catch (error) {
        lista.innerHTML = "";
        lista.appendChild(crearElemento("p", "mensaje-error", "No se pudo cargar el historial: " + error.message));
    }
}

// ---------------------------------------------------------------------------
// Panel general
// ---------------------------------------------------------------------------

function actualizarDashboard() {

    const contar = condicion => incidencias.filter(condicion).length;

    const pendientes = contar(i => i.estado === "Pendiente");

    document.getElementById("indTotal").textContent = incidencias.length;
    document.getElementById("indPendientes").textContent = pendientes;
    document.getElementById("indProceso").textContent = contar(i => i.estado === "En proceso");
    document.getElementById("indResueltas").textContent = contar(i => i.estado === "Resuelto");
    document.getElementById("indAlta").textContent =
        contar(i => i.prioridad === "Alta" && i.estado !== "Resuelto");

    const contador = document.getElementById("contadorPendientes");
    contador.textContent = pendientes;
    contador.hidden = pendientes === 0;

    // Lista de atención: no resueltas, ordenadas por prioridad y antigüedad
    const lista = document.getElementById("listaAtencion");
    lista.innerHTML = "";

    const atencion = incidencias
        .filter(i => i.estado !== "Resuelto")
        .sort((a, b) =>
            ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] ||
            (a.fecha_creacion || "").localeCompare(b.fecha_creacion || "")
        )
        .slice(0, 5);

    if (atencion.length === 0) {
        lista.appendChild(crearElemento("li", "texto-suave", "🎉 No hay incidencias pendientes."));
    }

    atencion.forEach(incidencia => {
        const item = crearElemento("li");

        const textos = crearElemento("div", "titulo-celda");
        textos.append(
            crearElemento("strong", "", `${iconoCategoria(incidencia.categoria)} ${incidencia.titulo}`),
            crearElemento("span", "texto-suave", `#${incidencia.id} · ${incidencia.avance} · ${fechaRelativa(incidencia.fecha_creacion)}`)
        );

        const acciones = crearElemento("div", "reporte-etiquetas");
        const boton = crearElemento("button", "boton boton-secundario boton-pequeno", "Gestionar");
        boton.type = "button";
        boton.addEventListener("click", () => abrirGestion(incidencia.id));

        acciones.append(crearEtiqueta(incidencia.prioridad, "prioridad"), boton);

        item.append(textos, acciones);
        lista.appendChild(item);
    });

    // Barras por categoría
    const barras = document.getElementById("barrasCategoria");
    barras.innerHTML = "";

    const maximo = Math.max(1, ...CATEGORIAS.map(c => contar(i => i.categoria === c)));

    CATEGORIAS.forEach(categoria => {
        const total = contar(i => i.categoria === categoria);

        const fila = crearElemento("div", "barra-fila");
        const pista = crearElemento("div", "barra-pista");
        const relleno = crearElemento("div", "barra-relleno");
        relleno.style.width = (total / maximo * 100) + "%";
        pista.appendChild(relleno);

        fila.append(
            crearElemento("span", "", `${iconoCategoria(categoria)} ${categoria}`),
            pista,
            crearElemento("strong", "", String(total))
        );

        barras.appendChild(fila);
    });

    actualizarMapaDashboard();
}

function actualizarMapaDashboard() {

    if (!mapaDashboard) {
        mapaDashboard = crearMapa(document.getElementById("mapaDashboard"), { zoom: 13 });

        if (!mapaDashboard) {
            return;
        }

        capaMarcadores = L.layerGroup().addTo(mapaDashboard);
    }

    capaMarcadores.clearLayers();

    const conUbicacion = incidencias.filter(i =>
        i.latitud != null && i.longitud != null && i.estado !== "Resuelto"
    );

    conUbicacion.forEach(incidencia => {
        const marcador = crearMarcador(incidencia.latitud, incidencia.longitud, incidencia.prioridad);

        const contenido = crearElemento("div");
        contenido.append(
            crearElemento("strong", "", `#${incidencia.id} ${incidencia.titulo}`),
            crearElemento("div", "", `${incidencia.prioridad} · ${incidencia.avance}`)
        );

        const boton = crearElemento("button", "boton boton-oscuro boton-pequeno", "Gestionar");
        boton.type = "button";
        boton.style.marginTop = "8px";
        boton.addEventListener("click", () => abrirGestion(incidencia.id));
        contenido.appendChild(boton);

        marcador.bindPopup(contenido);
        capaMarcadores.addLayer(marcador);
    });

    if (conUbicacion.length > 0) {
        const limites = L.latLngBounds(conUbicacion.map(i => [i.latitud, i.longitud]));
        mapaDashboard.fitBounds(limites, { padding: [30, 30], maxZoom: 16 });
    }

    setTimeout(() => mapaDashboard.invalidateSize(), 100);
}

// ---------------------------------------------------------------------------
// Tabla de incidencias
// ---------------------------------------------------------------------------

function filtrarIncidencias() {

    const estado = document.getElementById("filtroEstado").value;
    const categoria = document.getElementById("filtroCategoria").value;
    const prioridad = document.getElementById("filtroPrioridad").value;
    const orden = document.getElementById("ordenIncidencias").value;
    const texto = document.getElementById("filtroTitulo").value.toLowerCase().trim();

    const resultado = incidencias.filter(i =>
        (!estado || i.estado === estado) &&
        (!categoria || i.categoria === categoria) &&
        (!prioridad || i.prioridad === prioridad) &&
        (!texto ||
            (i.titulo || "").toLowerCase().includes(texto) ||
            (i.nombre_ciudadano || "").toLowerCase().includes(texto) ||
            String(i.id) === texto.replace("#", ""))
    );

    if (orden === "prioridad") {
        resultado.sort((a, b) =>
            (a.estado === "Resuelto") - (b.estado === "Resuelto") ||
            ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] ||
            b.id - a.id
        );
    } else if (orden === "antiguas") {
        resultado.sort((a, b) => a.id - b.id);
    } else {
        resultado.sort((a, b) => b.id - a.id);
    }

    return resultado;
}

function mostrarIncidenciasFiltradas() {

    const cuerpo = document.getElementById("cuerpoTablaIncidencias");
    const mensaje = document.getElementById("mensajeListadoIncidencias");

    const filtradas = filtrarIncidencias();

    cuerpo.innerHTML = "";

    if (filtradas.length === 0) {
        const fila = cuerpo.insertRow();
        const celda = fila.insertCell();
        celda.colSpan = 8;
        celda.className = "vacio";
        celda.textContent = "No hay incidencias que coincidan con los filtros.";
    }

    filtradas.forEach(incidencia => {

        const fila = cuerpo.insertRow();

        fila.insertCell().textContent = incidencia.id;

        const celdaTitulo = fila.insertCell();
        celdaTitulo.className = "titulo-celda";
        celdaTitulo.append(
            crearElemento("strong", "", incidencia.titulo),
            crearElemento("span", "", `${iconoCategoria(incidencia.categoria)} ${incidencia.categoria} · ${formatearFecha(incidencia.fecha_creacion, false)}`)
        );

        fila.insertCell().textContent = incidencia.nombre_ciudadano;

        fila.insertCell().appendChild(crearEtiqueta(incidencia.prioridad, "prioridad"));
        fila.insertCell().appendChild(crearEtiqueta(incidencia.estado, "estado"));
        fila.insertCell().textContent = incidencia.avance;

        const celdaResponsable = fila.insertCell();

        if (incidencia.responsable) {
            celdaResponsable.textContent = incidencia.responsable;
        } else {
            celdaResponsable.appendChild(crearElemento("span", "sin-asignar", "Sin asignar"));
        }

        const celdaAcciones = fila.insertCell();
        const boton = crearElemento("button", "boton boton-oscuro boton-pequeno", "Gestionar");
        boton.type = "button";
        boton.addEventListener("click", () => abrirGestion(incidencia.id));
        celdaAcciones.appendChild(boton);
    });

    mensaje.textContent = `Mostrando ${filtradas.length} de ${incidencias.length} incidencias`;
}

// ---------------------------------------------------------------------------
// Gestión de una incidencia
// ---------------------------------------------------------------------------

function llenarResponsables(incidencia) {

    const select = document.getElementById("gestionResponsable");
    select.innerHTML = "";

    const ninguno = crearElemento("option", "", "— Sin asignar —");
    ninguno.value = "";
    select.appendChild(ninguno);

    // Primero el personal de la especialidad de la incidencia
    const disponibles = personal
        .filter(p => p.activo || p.id === incidencia.personal_id)
        .sort((a, b) =>
            (b.especialidad === incidencia.categoria) - (a.especialidad === incidencia.categoria) ||
            a.nombre.localeCompare(b.nombre)
        );

    disponibles.forEach(persona => {
        const recomendado = persona.especialidad === incidencia.categoria ? " ⭐" : "";
        const opcion = crearElemento(
            "option",
            "",
            `${persona.nombre} (${persona.especialidad})${recomendado}`
        );
        opcion.value = persona.id;
        select.appendChild(opcion);
    });

    select.value = incidencia.personal_id ? String(incidencia.personal_id) : "";

    document.getElementById("ayudaResponsable").textContent =
        "⭐ Recomendado según la categoría. El catálogo se administra en la sección Personal.";
}

function actualizarNotaEstado() {
    const etapa = document.getElementById("gestionAvance").value;
    const estado = ESTADO_POR_ETAPA[etapa];

    document.getElementById("notaEstado").textContent =
        `El estado oficial de la incidencia quedará como «${estado}».`;
}

async function abrirGestion(id) {

    abrirModal("modalGestion");

    document.getElementById("gestionTitulo").textContent = "Cargando incidencia...";
    document.getElementById("gestionMeta").textContent = "";
    document.getElementById("gestionProgreso").innerHTML = "";
    document.getElementById("gestionHistorial").innerHTML = "";
    document.getElementById("errorGestion").hidden = true;
    document.getElementById("gestionComentario").value = "";

    try {
        const incidencia = await peticionAutenticada(`/api/incidencias/${id}`);
        incidenciaActual = incidencia;
        mostrarGestion(incidencia);
    } catch (error) {
        document.getElementById("gestionTitulo").textContent = "No se pudo cargar la incidencia";
        document.getElementById("gestionMeta").textContent = error.message;
    }
}

function mostrarGestion(incidencia) {

    document.getElementById("gestionTitulo").textContent =
        `${iconoCategoria(incidencia.categoria)} ${incidencia.titulo}`;

    const meta = document.getElementById("gestionMeta");
    meta.innerHTML = "";
    meta.append(
        crearElemento("span", "", "Incidencia #" + incidencia.id),
        crearElemento("span", "", "Reportada por " + incidencia.nombre_ciudadano),
        crearElemento("span", "", formatearFecha(incidencia.fecha_creacion))
    );

    const etiquetas = document.getElementById("gestionEtiquetas");
    etiquetas.innerHTML = "";
    etiquetas.append(
        crearEtiqueta(incidencia.estado, "estado"),
        crearEtiquetaPrioridad(incidencia.prioridad)
    );

    const progreso = document.getElementById("gestionProgreso");
    progreso.innerHTML = "";
    progreso.appendChild(crearProgreso(incidencia.avance));

    document.getElementById("gestionDescripcion").textContent = incidencia.descripcion;

    const datos = document.getElementById("gestionDatos");
    datos.innerHTML = "";

    const agregarDato = (titulo, valor, nodo) => {
        const grupo = crearElemento("div");
        const dd = crearElemento("dd", "", nodo ? null : valor);
        if (nodo) dd.appendChild(nodo);
        grupo.append(crearElemento("dt", "", titulo), dd);
        datos.appendChild(grupo);
    };

    agregarDato("Categoría", incidencia.categoria);

    if (incidencia.categoria_sugerida) {
        const etiquetaIa = crearElemento("span", "etiqueta etiqueta-ia", incidencia.categoria_sugerida);
        agregarDato("Sugerida por IA", null, etiquetaIa);
    }

    agregarDato("Responsable", incidencia.responsable || "Sin asignar");
    agregarDato("Última actualización", formatearFecha(
        incidencia.fecha_actualizacion || incidencia.fecha_creacion
    ));

    const resumen = document.getElementById("gestionResumen");
    resumen.textContent = incidencia.resumen_ia || "Aún no se ha generado un resumen.";
    resumen.className = incidencia.resumen_ia ? "" : "texto-suave";

    // Formulario
    document.getElementById("gestionPrioridad").value = incidencia.prioridad;
    document.getElementById("gestionCategoria").value = incidencia.categoria;
    document.getElementById("gestionAvance").value = incidencia.avance;
    llenarResponsables(incidencia);
    actualizarNotaEstado();

    // Historial
    const historial = document.getElementById("gestionHistorial");
    historial.innerHTML = "";
    historial.appendChild(crearLineaTiempo(incidencia.historial, { recientePrimero: true }));

    mostrarFoto(document.getElementById("gestionFoto"), incidencia);

    if (mapaGestion) {
        mapaGestion.remove();
        mapaGestion = null;
    }

    mapaGestion = mostrarUbicacion(document.getElementById("gestionMapa"), incidencia);
}

async function guardarGestion(evento) {

    evento.preventDefault();

    if (!incidenciaActual) {
        return;
    }

    const error = document.getElementById("errorGestion");
    const boton = document.getElementById("btnGuardarGestion");

    error.hidden = true;

    const responsable = document.getElementById("gestionResponsable").value;

    const cambios = {
        prioridad: document.getElementById("gestionPrioridad").value,
        categoria: document.getElementById("gestionCategoria").value,
        personal_id: responsable ? Number(responsable) : null
    };

    const avance = document.getElementById("gestionAvance").value;

    // Solo enviamos la etapa si el administrador la cambió; así el backend
    // puede avanzar automáticamente a "Personal asignado" al asignar a alguien.
    if (avance !== incidenciaActual.avance) {
        cambios.avance = avance;
    }

    const comentario = document.getElementById("gestionComentario").value.trim();

    if (comentario) {
        cambios.comentario = comentario;
    }

    boton.disabled = true;
    boton.textContent = "Guardando...";

    try {
        const datos = await peticionAutenticada(
            `/api/incidencias/${incidenciaActual.id}`,
            {
                method: "PATCH",
                body: JSON.stringify(cambios)
            }
        );

        notificar(datos.mensaje || "Incidencia actualizada");

        document.getElementById("gestionComentario").value = "";

        await Promise.all([cargarIncidencias(), abrirGestionSilencioso(incidenciaActual.id)]);

        historialGeneral = [];

    } catch (fallo) {
        error.textContent = "No fue posible guardar los cambios: " + fallo.message;
        error.hidden = false;
    } finally {
        boton.disabled = false;
        boton.textContent = "Guardar cambios";
    }
}

async function abrirGestionSilencioso(id) {
    const incidencia = await peticionAutenticada(`/api/incidencias/${id}`);
    incidenciaActual = incidencia;
    mostrarGestion(incidencia);
}

async function generarResumen() {

    if (!incidenciaActual) {
        return;
    }

    const boton = document.getElementById("btnGenerarResumen");
    const resumen = document.getElementById("gestionResumen");

    boton.disabled = true;
    boton.textContent = "Generando...";
    resumen.className = "texto-suave";
    resumen.textContent = "La IA está analizando la incidencia, esto puede tardar unos segundos...";

    try {
        const datos = await peticionAutenticada(
            `/api/incidencias/${incidenciaActual.id}/resumen`,
            { method: "POST" }
        );

        resumen.className = "";
        resumen.textContent = datos.resumen;

        notificar("Resumen generado (" + datos.metodo + ")", "info");

        // Solo se actualiza el historial para no perder cambios del formulario.
        const detalle = await peticionAutenticada(`/api/incidencias/${incidenciaActual.id}`);
        incidenciaActual.resumen_ia = detalle.resumen_ia;
        incidenciaActual.historial = detalle.historial;

        const historial = document.getElementById("gestionHistorial");
        historial.innerHTML = "";
        historial.appendChild(crearLineaTiempo(detalle.historial, { recientePrimero: true }));

    } catch (error) {
        resumen.textContent = "No fue posible generar el resumen: " + error.message;
    } finally {
        boton.disabled = false;
        boton.textContent = "Generar resumen";
    }
}

// ---------------------------------------------------------------------------
// Personal
// ---------------------------------------------------------------------------

function mostrarPersonal() {

    const cuerpo = document.getElementById("cuerpoTablaPersonal");
    cuerpo.innerHTML = "";

    if (personal.length === 0) {
        const fila = cuerpo.insertRow();
        const celda = fila.insertCell();
        celda.colSpan = 6;
        celda.className = "vacio";
        celda.textContent = "No hay personal registrado.";
        return;
    }

    personal.forEach(persona => {

        const asignaciones = incidencias.filter(i =>
            i.personal_id === persona.id && i.estado !== "Resuelto"
        ).length;

        const fila = cuerpo.insertRow();

        const celdaNombre = fila.insertCell();
        celdaNombre.className = "titulo-celda";
        celdaNombre.appendChild(crearElemento("strong", "", persona.nombre));

        fila.insertCell().textContent = `${iconoCategoria(persona.especialidad)} ${persona.especialidad}`;
        fila.insertCell().textContent = persona.telefono || "—";
        fila.insertCell().textContent = asignaciones;

        fila.insertCell().appendChild(crearElemento(
            "span",
            "estado-personal " + (persona.activo ? "activo" : "inactivo"),
            persona.activo ? "● Disponible" : "○ No disponible"
        ));

        const boton = crearElemento(
            "button",
            "boton boton-secundario boton-pequeno",
            persona.activo ? "Desactivar" : "Activar"
        );
        boton.type = "button";
        boton.addEventListener("click", () => cambiarDisponibilidad(persona));

        const botonEliminar = crearElemento("button", "boton boton-peligro boton-pequeno", "Eliminar");
        botonEliminar.type = "button";
        botonEliminar.addEventListener("click", () => eliminarPersonal(persona, asignaciones));

        const acciones = crearElemento("div", "acciones-fila");
        acciones.append(boton, botonEliminar);
        fila.insertCell().appendChild(acciones);
    });
}

async function eliminarPersonal(persona, asignaciones) {

    if (asignaciones > 0) {
        notificar(
            `${persona.nombre} tiene ${asignaciones} incidencia(s) sin resolver. ` +
            "Reasígnalas antes de eliminarlo o márcalo como no disponible.",
            "error"
        );
        return;
    }

    const confirmado = window.confirm(
        `¿Eliminar a «${persona.nombre}» del catálogo de personal?\n\n` +
        "Esta acción no se puede deshacer. Su nombre seguirá apareciendo en el historial de las incidencias que atendió."
    );

    if (!confirmado) {
        return;
    }

    try {
        const datos = await peticionAutenticada(`/api/usuarios/personal/${persona.id}`, {
            method: "DELETE"
        });

        notificar(datos.mensaje || "Personal eliminado");

        await Promise.all([cargarPersonal(), cargarIncidencias()]);

    } catch (error) {
        notificar("No se pudo eliminar: " + error.message, "error");
    }
}

async function cambiarDisponibilidad(persona) {

    try {
        await peticionAutenticada(`/api/usuarios/personal/${persona.id}`, {
            method: "PATCH",
            body: JSON.stringify({ activo: !persona.activo })
        });

        notificar(`${persona.nombre}: ${persona.activo ? "no disponible" : "disponible"}`, "info");

        await cargarPersonal();

    } catch (error) {
        notificar("No se pudo actualizar: " + error.message, "error");
    }
}

async function registrarPersonal(evento) {

    evento.preventDefault();

    const boton = document.getElementById("btnGuardarPersonal");

    const datos = {
        nombre: document.getElementById("nombrePersonal").value.trim(),
        especialidad: document.getElementById("especialidadPersonal").value,
        telefono: document.getElementById("telefonoPersonal").value.trim()
    };

    if (!datos.nombre) {
        notificar("Escribe el nombre del personal o cuadrilla.", "error");
        return;
    }

    boton.disabled = true;

    try {
        await peticionAutenticada("/api/usuarios/personal", {
            method: "POST",
            body: JSON.stringify(datos)
        });

        notificar("Personal agregado al catálogo");
        document.getElementById("formPersonal").reset();

        await cargarPersonal();

    } catch (error) {
        notificar("No se pudo registrar: " + error.message, "error");
    } finally {
        boton.disabled = false;
    }
}

// ---------------------------------------------------------------------------
// Historial general
// ---------------------------------------------------------------------------

function mostrarHistorial() {

    const lista = document.getElementById("listaHistorial");
    const texto = document.getElementById("filtroHistorial").value.toLowerCase().trim();

    const filtrado = historialGeneral.filter(registro =>
        !texto ||
        [registro.accion, registro.detalle, registro.usuario, registro.titulo_incidencia, "#" + registro.incidencia_id]
            .some(valor => (valor || "").toLowerCase().includes(texto))
    );

    // Se muestra el título de la incidencia en cada registro
    const registros = filtrado.map(registro => ({
        ...registro,
        accion: `#${registro.incidencia_id} ${registro.titulo_incidencia} — ${registro.accion}`
    }));

    lista.innerHTML = "";
    lista.appendChild(crearLineaTiempo(registros));
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

document.querySelectorAll("[data-actualizar]").forEach(boton => {
    boton.addEventListener("click", async () => {
        await Promise.all([cargarPersonal(), cargarIncidencias()]);
        notificar("Datos actualizados", "info");
    });
});

["filtroEstado", "filtroCategoria", "filtroPrioridad", "ordenIncidencias"].forEach(id =>
    document.getElementById(id).addEventListener("change", mostrarIncidenciasFiltradas)
);

document.getElementById("filtroTitulo").addEventListener("input", mostrarIncidenciasFiltradas);
document.getElementById("formGestion").addEventListener("submit", guardarGestion);
document.getElementById("gestionAvance").addEventListener("change", actualizarNotaEstado);
document.getElementById("btnGenerarResumen").addEventListener("click", generarResumen);
document.getElementById("formPersonal").addEventListener("submit", registrarPersonal);
document.getElementById("filtroHistorial").addEventListener("input", mostrarHistorial);
document.getElementById("btnActualizarHistorial").addEventListener("click", cargarHistorial);

iniciarPanelAdministrador();
