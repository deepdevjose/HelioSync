# HelioSync

HelioSync es una plataforma de monitoreo y orientación solar. Su propuesta no es solo mostrar datos: ayuda a entender cómo se comporta el sol en cada ubicación, recomendar la mejor alineación del panel y, cuando aplica, automatizar el seguimiento en un eje.

La idea central del producto es simple:

> no solo medir  
> sino ayudar a orientar, entender y optimizar

## Qué problema resuelve

Muchos tableros solares muestran potencia, voltaje o temperatura, pero dejan al usuario con la parte más difícil: interpretar si el sistema está bien orientado, si el sol está favoreciendo la captación o si conviene mover el panel.

HelioSync busca cerrar esa brecha con una capa de servicio e inteligencia:

- interpreta la salida del sistema
- explica el contexto solar
- usa la ubicación para guiar decisiones
- permite operar en modo fijo o en modo seguimiento

## Qué puede hacer hoy

- iniciar sesión con Google o correo/contraseña
- mantener sesión persistente
- guiar al usuario en un onboarding ligero
- guardar ubicación y modo de operación
- recomendar orientación inicial en modo fijo
- explicar el comportamiento del seguimiento en modo tracking
- reflejar el modo seleccionado dentro del dashboard
- mostrar una vista 3D del sistema con lectura visual del sol, alineación e incidencia
- trabajar en `es-MX` por defecto y `EN` como opción secundaria

## Experiencia del producto

### 1. Identidad primero

El acceso pide lo mínimo: nombre, correo y contraseña o Google. La configuración solar no se mezcla con el registro.

### 2. Configuración después del acceso

El onboarding guía al usuario por pocos pasos:

1. bienvenida
2. ubicación
3. elección entre modo fijo o seguimiento
4. recomendación de orientación o explicación del tracking
5. guardado final y entrada al dashboard

### 3. Dashboard con significado, no solo números

HelioSync intenta responder rápido:

- ¿todo está bien?
- ¿cuánto está generando?
- ¿por qué se ve así?
- ¿está siguiendo bien al sol o está fijo?

Por eso el dashboard no solo muestra telemetría. También traduce señales a estados como:

- `En punto`
- `Seguimiento activo`
- `Alineado con el sol`
- `Ajustando posición`
- `Modo fijo`

## Modos del sistema

### Modo fijo

Mantiene el panel en una orientación definida. HelioSync usa la ubicación para sugerir una dirección inicial razonable y una inclinación base.

### Modo seguimiento

Usa la ubicación y la trayectoria solar para acompañar el movimiento diario del sol en un eje. El foco del producto no es “mover un servo”, sino mejorar la alineación a lo largo del día.

## Idioma y tono

La interfaz está pensada primero para usuarios en México y LATAM:

- `es-MX` es el idioma principal
- `EN` existe como opción secundaria
- el lenguaje busca ser claro, corto y útil
- se evita traducir de forma literal términos técnicos que aumenten la carga cognitiva

## Estado actual

El proyecto ya cuenta con:

- autenticación persistente
- onboarding protegido
- Firebase Auth + Firestore
- localización básica del producto
- dashboard semántico
- vista 3D del sistema
- build de producción funcional

## Inicio rápido para desarrollo

### Requisitos

- Node.js 20+ recomendado
- npm 10+ recomendado
- un proyecto de Firebase si quieres auth real

### Instalar dependencias

```bash
npm install
```

### Variables de entorno

Crea un archivo `.env.local` con:

```env
VITE_FIREBASE_API_KEY="..."
VITE_FIREBASE_AUTH_DOMAIN="..."
VITE_FIREBASE_PROJECT_ID="..."
VITE_FIREBASE_STORAGE_BUCKET="..."
VITE_FIREBASE_MESSAGING_SENDER_ID="..."
VITE_FIREBASE_APP_ID="..."
VITE_FIREBASE_MEASUREMENT_ID="..."
```

Si estas variables faltan, la app entra en modo local/mock para no romper el flujo de trabajo.

### Ejecutar en local

```bash
npm run dev
```

### Validar

```bash
npm run lint
npm run build
```

## Firebase

Para usar Firebase real, habilita:

- `Authentication` > `Email/Password`
- `Authentication` > `Google`

Y agrega como dominios autorizados:

- `localhost`
- tu subdominio de Cloudflare Pages
- tu dominio custom, si aplica

La app usa dos colecciones principales:

- `users`
- `userSetups`

## Deploy

### Cloudflare Pages

Configuración recomendada:

```txt
Build command: npm run build
Build output directory: dist
```

También debes configurar en Cloudflare Pages las mismas variables `VITE_FIREBASE_*` que usas localmente.

## Estructura del repositorio

```txt
src/
  components/
  i18n/
  pages/
  services/
  store/
```

Archivos clave:

- `src/App.jsx`: guardas de auth, onboarding y dashboard
- `src/main.jsx`: arranque de la app y proveedor de idioma
- `src/services/authClient.js`: autenticación real/mock y persistencia
- `src/services/userData.js`: perfil y preferencias del usuario
- `src/services/solarRecommendations.js`: lógica de recomendación solar
- `src/components/Dashboard/dashboardInsights.js`: capa semántica del dashboard
- `src/components/Dashboard/SolarPanelCanvas.jsx`: escena 3D del sistema
- `src/i18n/messages.js`: copy del producto

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

## Dirección del proyecto

HelioSync está construyéndose como una experiencia de asistencia solar:

- menos dashboard técnico crudo
- más interpretación útil
- menos control manual expuesto
- más guía basada en ubicación y trayectoria solar

## Pendientes razonables

- refinar reglas de Firestore para producción
- mejorar iconos del manifest PWA
- optimizar el chunk de `three`
- hacer smoke test completo en Cloudflare + Firebase real

## Licencia

Proyecto privado.
