// Funciones de interfaz compartidas por el panel ciudadano y el administrador.

import { obtenerArchivoProtegido } from "./api.js";

export const ETAPAS = [
    "Reporte recibido",
    "En revisión",
    "Personal asignado",
    "Personal en camino",
    "Trabajo en proceso",
    "Resuelto"
];

export const DESCRIPCION_ETAPA = {
    "Reporte recibido": "Tu reporte fue registrado correctamente.",
    "En revisión": "El equipo administrativo está revisando el reporte.",
    "Personal asignado": "Se asignó a una persona o cuadrilla responsable.",
    "Personal en camino": "El personal se dirige al lugar del problema.",
    "Trabajo en proceso": "Se está atendiendo la incidencia.",
    "Resuelto": "El trabajo terminó y el reporte fue cerrado."
};

export const ESTADO_POR_ETAPA = {
    "Reporte recibido": "Pendiente",
    "En revisión": "Pendiente",
    "Personal asignado": "En proceso",
    "Personal en camino": "En proceso",
    "Trabajo en proceso": "En proceso",
    "Resuelto": "Resuelto"
};

export const CATEGORIAS = [
    "Alumbrado público",
    "Fuga de agua",
    "Calles dañadas",
    "Infraestructura",
    "Incendios",
    "Otros"
];

// Centro predeterminado del mapa: Retalhuleu, Guatemala.
export const CENTRO_MAPA = [14.5370, -91.6772];

const ICONO_CATEGORIA = {
    "Alumbrado público": "💡",
    "Fuga de agua": "💧",
    "Calles dañadas": "🚧",
    "Infraestructura": "🏗️",
    "Incendios": "🔥",
    "Otros": "📌"
};

export function iconoCategoria(categoria) {
    return ICONO_CATEGORIA[categoria] || "📌";
}

// ---------------------------------------------------------------------------
// Elementos básicos
// ---------------------------------------------------------------------------

export function crearElemento(etiqueta, clase, texto) {
    const elemento = document.createElement(etiqueta);

    if (clase) {
        elemento.className = clase;
    }

    if (texto !== undefined && texto !== null) {
        elemento.textContent = texto;
    }

    return elemento;
}

function normalizar(texto) {
    return (texto || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, "-");
}

export function crearEtiqueta(valor, tipo) {
    const etiqueta = crearElemento(
        "span",
        `etiqueta ${tipo}-${normalizar(valor)}`,
        valor ?? ""
    );

    return etiqueta;
}

export function crearEtiquetaPrioridad(prioridad) {
    return crearElemento(
        "span",
        `etiqueta prioridad-${normalizar(prioridad)}`,
        "Prioridad " + (prioridad || "").toLowerCase()
    );
}

export function formatearFecha(iso, conHora = true) {
    if (!iso) {
        return "Sin fecha";
    }

    const fecha = new Date(iso);

    if (Number.isNaN(fecha.getTime())) {
        return iso;
    }

    const opciones = {
        day: "2-digit",
        month: "short",
        year: "numeric"
    };

    if (conHora) {
        opciones.hour = "2-digit";
        opciones.minute = "2-digit";
    }

    return fecha.toLocaleString("es-GT", opciones);
}

export function fechaRelativa(iso) {
    if (!iso) {
        return "";
    }

    const diferencia = (Date.now() - new Date(iso).getTime()) / 1000;

    if (diferencia < 60) return "hace un momento";
    if (diferencia < 3600) return `hace ${Math.floor(diferencia / 60)} min`;
    if (diferencia < 86400) return `hace ${Math.floor(diferencia / 3600)} h`;
    if (diferencia < 86400 * 30) return `hace ${Math.floor(diferencia / 86400)} días`;

    return formatearFecha(iso, false);
}

// ---------------------------------------------------------------------------
// Seguimiento (línea de progreso)
// ---------------------------------------------------------------------------

export function crearProgreso(etapaActual, compacto = false) {
    const indice = Math.max(0, ETAPAS.indexOf(etapaActual || "Reporte recibido"));

    const lista = crearElemento("ol", compacto ? "progreso compacto" : "progreso");

    ETAPAS.forEach((etapa, i) => {
        const paso = crearElemento("li", "progreso-paso");

        if (i < indice) paso.classList.add("completado");
        if (i === indice) paso.classList.add("actual");
        if (i === indice && etapa === "Resuelto") paso.classList.add("completado");

        const punto = crearElemento("span", "progreso-punto", i < indice || etapa === "Resuelto" && i === indice ? "✓" : String(i + 1));
        const texto = crearElemento("span", "progreso-texto", etapa);

        paso.append(punto, texto);

        if (!compacto && i === indice) {
            paso.appendChild(
                crearElemento("span", "progreso-detalle", DESCRIPCION_ETAPA[etapa])
            );
        }

        lista.appendChild(paso);
    });

    return lista;
}

// ---------------------------------------------------------------------------
// Historial (línea de tiempo)
// ---------------------------------------------------------------------------

export function crearLineaTiempo(historial, opciones = {}) {
    const contenedor = crearElemento("ul", "linea-tiempo");

    if (!historial || historial.length === 0) {
        contenedor.appendChild(
            crearElemento("li", "vacio", "Aún no hay movimientos registrados.")
        );
        return contenedor;
    }

    const registros = opciones.recientePrimero
        ? [...historial].reverse()
        : historial;

    registros.forEach(registro => {
        const item = crearElemento("li", "linea-item");

        const cabecera = crearElemento("div", "linea-cabecera");
        cabecera.append(
            crearElemento("strong", "", registro.accion),
            crearElemento("time", "", formatearFecha(registro.fecha))
        );

        item.appendChild(cabecera);

        if (registro.detalle) {
            item.appendChild(crearElemento("p", "linea-detalle", registro.detalle));
        }

        if (opciones.mostrarUsuario !== false) {
            item.appendChild(
                crearElemento(
                    "span",
                    "linea-usuario",
                    `${registro.usuario}${registro.rol ? " · " + registro.rol : ""}`
                )
            );
        }

        contenedor.appendChild(item);
    });

    return contenedor;
}

// ---------------------------------------------------------------------------
// Fotografía protegida
// ---------------------------------------------------------------------------

export async function mostrarFoto(contenedor, incidencia) {
    contenedor.innerHTML = "";

    if (!incidencia.tiene_foto) {
        contenedor.appendChild(
            crearElemento("div", "foto-vacia", "Sin fotografía adjunta")
        );
        return;
    }

    contenedor.appendChild(crearElemento("div", "foto-vacia", "Cargando fotografía..."));

    try {
        const url = await obtenerArchivoProtegido(
            `/api/incidencias/${incidencia.id}/foto`
        );

        const enlace = crearElemento("a", "foto-enlace");
        enlace.href = url;
        enlace.target = "_blank";
        enlace.rel = "noopener";
        enlace.title = "Abrir fotografía en tamaño completo";

        const imagen = document.createElement("img");
        imagen.src = url;
        imagen.alt = "Fotografía de la incidencia: " + incidencia.titulo;
        imagen.className = "foto-incidencia";

        enlace.appendChild(imagen);

        contenedor.innerHTML = "";
        contenedor.appendChild(enlace);

    } catch (error) {
        contenedor.innerHTML = "";
        contenedor.appendChild(
            crearElemento("div", "foto-vacia", "No fue posible cargar la fotografía")
        );
    }
}

// ---------------------------------------------------------------------------
// Mapas (Leaflet + OpenStreetMap)
// ---------------------------------------------------------------------------

export function crearMapa(elemento, opciones = {}) {
    if (typeof L === "undefined") {
        elemento.textContent = "No se pudo cargar el mapa (revisa la conexión a internet).";
        elemento.classList.add("mapa-error");
        return null;
    }

    const mapa = L.map(elemento, {
        scrollWheelZoom: opciones.scrollWheelZoom ?? true
    }).setView(opciones.centro || CENTRO_MAPA, opciones.zoom || 14);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
    }).addTo(mapa);

    return mapa;
}

const COLOR_PRIORIDAD = {
    "Alta": "#c2410c",
    "Media": "#b7791f",
    "Baja": "#2f855a"
};

export function crearMarcador(lat, lng, prioridad) {
    return L.circleMarker([lat, lng], {
        radius: 9,
        color: "#ffffff",
        weight: 2,
        fillColor: COLOR_PRIORIDAD[prioridad] || "#1e3a5f",
        fillOpacity: 0.95
    });
}

export function mostrarUbicacion(elemento, incidencia) {
    elemento.innerHTML = "";
    elemento.classList.remove("mapa-error");

    if (incidencia.latitud == null || incidencia.longitud == null) {
        elemento.classList.add("mapa-error");
        elemento.textContent = "El reporte no incluye ubicación.";
        return null;
    }

    const mapa = crearMapa(elemento, {
        centro: [incidencia.latitud, incidencia.longitud],
        zoom: 16,
        scrollWheelZoom: false
    });

    if (mapa) {
        L.marker([incidencia.latitud, incidencia.longitud]).addTo(mapa);
        setTimeout(() => mapa.invalidateSize(), 150);
    }

    return mapa;
}

// ---------------------------------------------------------------------------
// Ventana modal y notificaciones
// ---------------------------------------------------------------------------

export function abrirModal(id) {
    const modal = document.getElementById(id);
    modal.hidden = false;
    document.body.classList.add("modal-abierto");
}

export function cerrarModal(id) {
    const modal = document.getElementById(id);
    modal.hidden = true;
    document.body.classList.remove("modal-abierto");
}

export function configurarModal(id, alCerrar) {
    const modal = document.getElementById(id);

    const cerrar = () => {
        cerrarModal(id);
        if (alCerrar) alCerrar();
    };

    modal.addEventListener("click", evento => {
        if (evento.target === modal || evento.target.closest("[data-cerrar]")) {
            cerrar();
        }
    });

    document.addEventListener("keydown", evento => {
        if (evento.key === "Escape" && !modal.hidden) {
            cerrar();
        }
    });
}

export function notificar(mensaje, tipo = "exito") {
    let zona = document.getElementById("zonaNotificaciones");

    if (!zona) {
        zona = crearElemento("div", "zona-notificaciones");
        zona.id = "zonaNotificaciones";
        zona.setAttribute("role", "status");
        document.body.appendChild(zona);
    }

    const aviso = crearElemento("div", `notificacion ${tipo}`, mensaje);
    zona.appendChild(aviso);

    setTimeout(() => aviso.classList.add("saliendo"), 3800);
    setTimeout(() => aviso.remove(), 4300);
}

// ---------------------------------------------------------------------------
// Navegación por vistas (#inicio, #nueva, ...)
// ---------------------------------------------------------------------------

export function configurarNavegacion(vistas, predeterminada, alCambiar) {
    function mostrar() {
        const hash = window.location.hash.replace("#", "");
        const vista = vistas.includes(hash) ? hash : predeterminada;

        vistas.forEach(nombre => {
            const seccion = document.getElementById("vista-" + nombre);
            if (seccion) seccion.hidden = nombre !== vista;
        });

        document.querySelectorAll("[data-vista]").forEach(enlace => {
            enlace.classList.toggle("activo", enlace.dataset.vista === vista);
            if (enlace.dataset.vista === vista) {
                enlace.setAttribute("aria-current", "page");
            } else {
                enlace.removeAttribute("aria-current");
            }
        });

        document.body.classList.remove("menu-abierto");
        window.scrollTo({ top: 0 });

        if (alCambiar) alCambiar(vista);
    }

    window.addEventListener("hashchange", mostrar);
    mostrar();

    const botonMenu = document.getElementById("btnMenu");

    if (botonMenu) {
        botonMenu.addEventListener("click", () => {
            document.body.classList.toggle("menu-abierto");
        });
    }
}

export function iniciales(nombre) {
    return (nombre || "?")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(parte => parte[0].toUpperCase())
        .join("");
}
