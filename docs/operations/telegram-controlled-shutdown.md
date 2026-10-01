# Programar apagado completo desde Telegram

Aterum, n8n y el bot corren dentro de WSL. El apagado de Windows lo ejecuta una tarea de **Windows Task Scheduler**, no cron de WSL. El bot únicamente solicita programar, consultar o cancelar una tarea fija por un socket local; no acepta comandos shell arbitrarios.

## Instalación por PC

Después de `git pull`, desde la distro WSL bajo el usuario del proyecto:

```bash
cd ~/projects/aterum/aterum_gui
bash scripts/install-shutdown-control.sh
systemctl status "aterum-shutdown-bridge@$(id -un).service"
```

El instalador copia el ejecutor PowerShell a `%LOCALAPPDATA%\\Aterum`, guarda la configuración de distro/usuario en `~/.local/state/aterum-shutdown/config.json` (sin secretos) e inicia un servicio systemd local. No programa ni ejecuta apagados. Si cambian el usuario, la distro o el código PowerShell, vuelve a ejecutar el instalador.

En `.env` local, configura `TELEGRAM_SHUTDOWN_ALLOWED_USER_IDS` con el ID numérico de los administradores autorizados. Es una lista separada por comas. Además deben tener rol `admin` en el bot. Mantén la lista vacía si no quieres habilitar esta función. Reconstruye/recrea solo `telegram_control` para aplicar el cambio de `.env` y el montaje de Compose; no es necesario reiniciar Windows.

```bash
docker compose --profile trading --profile ai --profile aux up -d --no-deps --force-recreate telegram_control
```

La configuración del bot exige un administrador incluido explícitamente en la lista. Programar y cancelar requieren **chat privado**; consultar el estado también funciona en un grupo autorizado:

- `/shutdown_at 23:30`: una sola vez, a la próxima hora 23:30 de la zona horaria local de Windows. Si faltan menos de dos minutos, programa mañana.
- `/shutdown_status`: muestra la próxima tarea y el resultado anterior.
- `/shutdown_cancel`: elimina la tarea pendiente. No detiene una migración que ya empezó.

A la hora indicada, Windows llama `wsl.exe -d <distro> -u <usuario> -- node .../aterum-control.js migrate`. Si el proceso termina con código cero, comprueba `RETIRED`, `inhibited`, `migrationReady` y cero contenedores en ejecución. **Solo entonces** solicita `shutdown.exe /s /t 60`. Si falla Git, la certificación o WSL, Windows permanece encendido y el error queda en `%LOCALAPPDATA%\\Aterum\\controlled-shutdown.log`. Durante los 60 segundos de aviso se puede abortar localmente con `shutdown /a`.

La tarea usa la sesión interactiva del usuario de Windows: éste debe seguir conectado y Git debe poder hacer push sin solicitar contraseña. No despierta una PC suspendida ni reprograma automáticamente una hora perdida. El servicio en WSL sigue vivo cuando `migrate` detiene los contenedores, pero el ejecutor final está en Windows.

Este mecanismo **no inicia la otra PC**. Cuando la PC anterior esté retirada y Git muestre el turno liberado, ejecuta `aterum start` en la otra. Los SL/TP nativos de Binance permanecen; los monitores locales dejan de funcionar durante el intervalo apagado. El control no reemplaza un respaldo de datos ni sincroniza bases entre PCs.

Para diagnosticar: `journalctl -u "aterum-shutdown-bridge@$(id -un).service" -n 100`, `aterum status` y el registro Windows anterior. La prueba automatizada cubre permisos, validación, transporte y acciones fijas; en Delcon se probó crear, consultar y cancelar una tarea de Windows para el día siguiente, sin ejecutar apagado ni reactivar trading. La primera ejecución real programada debe verificarse en cada PC.
