async function probarUsuarios() {
    const respuesta = await fetch("http://localhost:5001/api/usuarios");
    const datos = await respuesta.json();

    document.getElementById("resultado").textContent =
        JSON.stringify(datos, null, 2);
}

async function probarIncidencias() {
    const respuesta = await fetch("http://localhost:5002/api/incidencias");
    const datos = await respuesta.json();

    document.getElementById("resultado").textContent =
        JSON.stringify(datos, null, 2);
}