import os
import re

import requests

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
MODELO_IA = os.getenv("MODELO_IA", "llama3.2:1b")

CATEGORIAS = [
    "Alumbrado público",
    "Fuga de agua",
    "Calles dañadas",
    "Infraestructura",
    "Incendios",
    "Otros"
]

# Palabras clave para sugerir la categoría sin depender totalmente del modelo.
PALABRAS_CATEGORIA = {
    # Incluye expresiones comunes en Guatemala ("foco", "bombillo", "se fue la luz").
    "Alumbrado público": [
        "foco", "focos", "foco quemado", "bombillo", "bombilla", "poste",
        "poste de luz", "alumbrado", "luminaria", "lampara", "lámpara",
        "no hay luz", "sin luz", "se fue la luz", "apagón", "apagon",
        "oscuro", "oscura", "apagado", "cables"
    ],
    "Fuga de agua": [
        "fuga", "agua", "tubería", "tuberia", "drenaje", "alcantarilla",
        "inundando", "inundación", "inundacion", "charco", "tubo roto",
        "aguas negras", "desagüe", "desague"
    ],
    "Calles dañadas": [
        "bache", "baches", "calle", "asfalto", "pavimento", "hundimiento",
        "carretera", "banqueta", "acera", "socavón", "socavon", "grieta"
    ],
    "Infraestructura": [
        "puente", "muro", "pared", "edificio", "parque", "escuela",
        "señal", "senal", "semáforo", "semaforo", "derrumbe", "techo",
        "estructura", "basura"
    ],
    "Incendios": [
        "incendio", "fuego", "llamas", "humo", "se está quemando",
        "se esta quemando", "quemando", "quemazón", "quemazon",
        "quema de basura", "ardiendo", "bomberos", "chispas"
    ]
}


def _consultar_ollama(prompt, timeout=90):
    """Envía un prompt a Ollama y devuelve el texto generado."""
    respuesta = requests.post(
        OLLAMA_URL,
        json={
            "model": MODELO_IA,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0
            }
        },
        timeout=timeout
    )

    respuesta.raise_for_status()

    return respuesta.json().get("response", "").strip()


def clasificar_prioridad(titulo, descripcion):
    texto = f"{titulo} {descripcion}".lower()

    emergencias = [
        "inundando",
        "inundación",
        "inundacion",
        "incendio",
        "fuego",
        "llamas",
        "se está quemando",
        "se esta quemando",
        "explosión",
        "explosion",
        "electrocución",
        "electrocucion",
        "cables eléctricos expuestos",
        "cables electricos expuestos",
        "riesgo de derrumbe",
        "personas atrapadas",
        "fuga de gas"
    ]

    for emergencia in emergencias:
        if emergencia in texto:
            return {
                "prioridad": "Alta",
                "metodo": "Reglas de seguridad"
            }

    prompt = f"""
Eres un clasificador de incidencias de infraestructura pública.

Clasifica la siguiente incidencia utilizando una sola palabra:
Alta, Media o Baja.

Criterios:
Alta: peligro inmediato para personas o daños graves.
Media: problemas que necesitan reparación, pero sin peligro inmediato.
Baja: problemas estéticos o de mantenimiento menor.

Título: {titulo}
Descripción: {descripcion}

Responde únicamente una palabra: Alta, Media o Baja.
"""

    try:
        resultado = _consultar_ollama(prompt).lower()
        resultado = resultado.strip(" .!¡¿?\"'")

        if resultado == "alta":
            prioridad = "Alta"
        elif resultado == "media":
            prioridad = "Media"
        elif resultado == "baja":
            prioridad = "Baja"
        else:
            prioridad = "Media"

        return {
            "prioridad": prioridad,
            "metodo": "Inteligencia artificial"
        }

    except requests.RequestException as error:
        print("Error al consultar Ollama:", error)

        return {
            "prioridad": "Media",
            "metodo": "Valor predeterminado"
        }


def sugerir_categoria(titulo, descripcion):
    """
    Sugiere una categoría para la incidencia.
    1. Primero busca palabras clave (rápido y confiable).
    2. Si no encuentra coincidencias, consulta al modelo de IA.
    3. Si la IA no está disponible, devuelve "Otros".
    """
    texto = f"{titulo} {descripcion}".lower()

    puntajes = {}

    for categoria, palabras in PALABRAS_CATEGORIA.items():
        puntaje = sum(1 for palabra in palabras if palabra in texto)

        if puntaje:
            puntajes[categoria] = puntaje

    if puntajes:
        mejor = max(puntajes, key=puntajes.get)

        return {
            "categoria": mejor,
            "metodo": "Reglas de palabras clave"
        }

    prompt = f"""
Eres un asistente que clasifica reportes ciudadanos de infraestructura pública.

Elige UNA categoría de esta lista:
- Alumbrado público
- Fuga de agua
- Calles dañadas
- Infraestructura
- Incendios
- Otros

Título: {titulo}
Descripción: {descripcion}

Responde únicamente con el nombre exacto de la categoría.
"""

    try:
        respuesta = _consultar_ollama(prompt, timeout=60).lower()

        for categoria in CATEGORIAS:
            if categoria.lower() in respuesta:
                return {
                    "categoria": categoria,
                    "metodo": "Inteligencia artificial"
                }

        return {
            "categoria": "Otros",
            "metodo": "Inteligencia artificial"
        }

    except requests.RequestException as error:
        print("Error al consultar Ollama (categoría):", error)

        return {
            "categoria": "Otros",
            "metodo": "Valor predeterminado"
        }


def _resumen_basico(titulo, descripcion, categoria, prioridad):
    """Resumen de respaldo cuando Ollama no está disponible."""
    oraciones = re.split(r"(?<=[.!?])\s+", descripcion.strip())
    principal = oraciones[0] if oraciones and oraciones[0] else descripcion

    if len(principal) > 220:
        principal = principal[:217].rstrip() + "..."

    return (
        f"Reporte de {categoria.lower()} con prioridad {prioridad.lower()}: "
        f"{titulo.strip()}. {principal}"
    )


def generar_resumen(titulo, descripcion, categoria, prioridad):
    """Genera un resumen breve de la incidencia para el administrador."""
    prompt = f"""
Eres un asistente para el personal administrativo de una municipalidad.

Resume la siguiente incidencia en español en un máximo de 2 oraciones.
Indica qué problema existe, dónde o a quién afecta (si se menciona)
y qué acción se recomienda.
No inventes datos que no aparezcan en el reporte.

Título: {titulo}
Categoría: {categoria}
Prioridad: {prioridad}
Descripción: {descripcion}

Resumen:
"""

    try:
        resumen = _consultar_ollama(prompt, timeout=120)
        resumen = resumen.strip().strip('"').strip()

        if not resumen:
            raise ValueError("Respuesta vacía")

        return {
            "resumen": resumen,
            "metodo": "Inteligencia artificial"
        }

    except (requests.RequestException, ValueError) as error:
        print("Error al generar resumen con Ollama:", error)

        return {
            "resumen": _resumen_basico(titulo, descripcion, categoria, prioridad),
            "metodo": "Resumen automático básico (IA no disponible)"
        }
