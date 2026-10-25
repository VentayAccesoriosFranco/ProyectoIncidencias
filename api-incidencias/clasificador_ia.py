
import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
MODELO_IA = "llama3.2:1b"


def clasificar_prioridad(titulo, descripcion):
    texto = f"{titulo} {descripcion}".lower()

    emergencias = [
        "inundando",
        "inundación",
        "inundacion",
        "incendio",
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
            timeout=90
        )

        respuesta.raise_for_status()

        datos = respuesta.json()

        resultado = datos.get("response", "").strip().lower()
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
