# MyWorkout – Aplicación Web con Arquitectura de Microservicios

---

## 0) Software que se necesita instalar

Para poder ejecutar el proyecto es necesario tener instalado en el sistema:

- **Docker Desktop**

  - Incluye Docker Engine y Docker Compose
  - Permite ejecutar los microservicios y las bases de datos en contenedores
  - https://www.docker.com/products/docker-desktop/

- **Git**
  - Necesario para clonar el repositorio del proyecto
  - https://git-scm.com/

No es necesario instalar de forma manual:

- Node.js
- Python
- MySQL
- MongoDB

Todo el software adicional se ejecuta dentro de contenedores Docker.

---

## 1) Servicios que hay que arrancar

El proyecto está compuesto por los siguientes servicios:

- **Frontend (Angular)**  
  Aplicación web HTML5 desarrollada como Single Page Application (SPA).

- **API Gateway (Node.js + Express)**  
  Punto único de entrada a la aplicación.  
  Todas las peticiones del frontend pasan por este Gateway, que se encarga de enrutar cada petición al microservicio correspondiente.

- **Core API (Node.js + Express)**  
  Microservicio encargado de la gestión de:

  - Entrenamientos
  - Ejercicios
  - Series  
    Utiliza una base de datos relacional **MySQL**.

- **Analytics API (Python + FastAPI)**  
  Microservicio encargado de:

  - Calcular analíticas
  - Generar informes
  - Almacenar el historial de informes generados  
    Utiliza una base de datos no relacional **MongoDB** y expone una API REST documentada con OpenAPI 3.0.

- **MySQL**  
  Base de datos relacional utilizada por el Core API.

- **MongoDB**  
  Base de datos no relacional utilizada para almacenar los informes generados.

Todos estos servicios se arrancan de forma conjunta mediante Docker Compose.

---

## 2) Dependencias que hay que instalar

No es necesario instalar dependencias manualmente.

Las dependencias de cada parte del proyecto se gestionan automáticamente durante la construcción de los contenedores Docker:

- Dependencias **Node.js (npm)** → instaladas dentro de los contenedores Node
- Dependencias **Python (pip)** → instaladas dentro de los contenedores Python
- **MySQL** y **MongoDB** → incluidas como imágenes Docker oficiales

El único requisito para el desarrollador es disponer de Docker Desktop.

---

## 3) Cómo arrancar la parte servidora

Desde la **raíz del proyecto** (donde se encuentra el archivo `docker-compose.yml`), ejecutar el siguiente comando:

```bash
docker compose up --build
```

Este comando realiza las siguientes acciones:

- Construye las imágenes Docker de todos los microservicios
- Arranca el API Gateway
- Arranca el Core API junto con la base de datos MySQL
- Arranca el Analytics API junto con la base de datos MongoDB
- Deja la aplicación completamente operativa

Para detener todos los servicios y liberar los contenedores, ejecutar:

```bash
docker compose down
```

---

## 4) Cómo acceder a la parte cliente

### Acceso a la interfaz web (HTML5)

- **Frontend Angular (cliente web)**  
  URL:  
  http://localhost:4200

Desde esta interfaz web se puede:

- Crear y consultar entrenamientos
- Visualizar analíticas
- Generar informes en PDF
- Consultar el historial de informes almacenados en MongoDB

---

### Acceso a la interfaz programática (API REST)

- **API Gateway (punto único de entrada a las APIs)**  
  URL base:  
  http://localhost:8080

Todas las peticiones del frontend y de posibles clientes externos pasan por este Gateway, que se encarga de enrutar las llamadas a los microservicios correspondientes.

---

### Documentación OpenAPI 3.0

La aplicación ofrece una interfaz programática documentada mediante **OpenAPI 3.0**, accesible a través del microservicio de analíticas:

- **Swagger UI (Analytics API)**  
  http://localhost:8000/docs

- **Especificación OpenAPI (JSON)**  
  http://localhost:8000/openapi.json
