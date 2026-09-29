# Publicación temporal del GUI con ngrok en WSL

El servicio de usuario `aterum-gui-tunnel@<usuario>.service` espera a que el GUI de `127.0.0.1:3001` y n8n estén saludables, inicia un único agente ngrok para el puerto 3001, lee el endpoint HTTPS del API local de inspección, comprueba el endpoint desde internet y anuncia el enlace mediante `services/telegram_delivery.js` dentro del contenedor Dashboard. No publica los puertos de n8n, Chart API, MySQL ni Redis.

El túnel requiere `NGROK_AUTHTOKEN` en el `.env` local, que no está versionado. El acceso público usa únicamente el login de Aterum; el monitor comprueba que las APIs privadas rechazan solicitudes sin sesión. n8n y otros clientes internos conservan su acceso local. La configuración de ngrok se genera en `/run/aterum-gui-tunnel` con permisos `0600`. La URL y el último arranque anunciado se guardan en `/var/lib/aterum-gui-tunnel/state.json` sin guardar credenciales.

En Telegram, `🌐 GUI público` o `/tunnel` muestra la URL vigente y un botón **Abrir GUI**. El bot lee `/var/lib/aterum-gui-tunnel/current.json` desde un montaje de solo lectura; el monitor actualiza su marca temporal cada 10 segundos y elimina el archivo al detenerse. El bot descarta el estado si supera los 30 segundos, así no ofrece un enlace anterior como actual cuando el monitor cae sin poder limpiarlo.

En el plan gratuito de ngrok, los navegadores muestran una intersticial con **Visit Site** antes del GUI. Es un límite del plan, no una demora del GUI: el primer visitante debe confirmarla una vez y ngrok guarda una cookie para ese navegador durante 7 días. El monitor ahora comprueba la respuesta simulando un navegador, registra si esa confirmación aplica y verifica que el GUI real esté detrás de la intersticial. Telegram informa del paso inicial. ngrok indica que un plan pagado quita esa página; sin cambiar de plan, se puede evitar temporalmente al confirmar **Visit Site** en cada navegador.

Una sola ejecución de arranque permite hasta 12 ciclos de espera con errores registrados; systemd vuelve a intentar el servicio cada 45 segundos si sigue fallando. Para evitar mensajes duplicados, un resultado de Telegram ambiguo no se reenvía automáticamente; los errores confirmados sí tienen hasta tres intentos. Al reiniciar WSL cambia el `boot_id` y el enlace se anuncia de nuevo aunque ngrok asigne la misma URL. Una URL o ID de túnel diferente durante el mismo arranque también se anuncia.

## Instalación

1. Añade `NGROK_AUTHTOKEN=<tu token>` al `.env` local; nunca lo pongas en el repositorio ni en Telegram. El agente oficial puede instalarse desde el [repositorio oficial de ngrok para Debian](https://ngrok.com/download/linux).
2. Ejecuta desde `aterum_gui/`:

   ```bash
   ./scripts/install-gui-tunnel-service.sh
   ```

3. Revisa el servicio:

   ```bash
   systemctl status aterum-gui-tunnel@delcon.service
   journalctl -u aterum-gui-tunnel@delcon.service -f
   ```

## Detener y reanudar

```bash
sudo systemctl stop aterum-gui-tunnel@delcon.service
sudo systemctl start aterum-gui-tunnel@delcon.service
```

Al detener el servicio, systemd detiene también el agente ngrok que inició. Para deshabilitar el inicio automático:

```bash
sudo systemctl disable --now aterum-gui-tunnel@delcon.service
```

WSL debe iniciarse con Windows para que este servicio systemd arranque; `/etc/wsl.conf` ya tiene `systemd=true`. No se reinicia Windows como parte de la instalación.

## Validación del acceso público

Primero puede aparecer la intersticial gratuita de ngrok; después aparece directamente el formulario de sesión de Aterum. Las páginas y recursos del GUI usan rutas relativas y el WebSocket del dashboard deriva `ws:`/`wss:` del origen actual, por lo que la navegación no llama a `localhost` en el dispositivo remoto. El chequeo previo al anuncio comprueba que se sirve el formulario real de Aterum y que `/api/account` devuelve `401` sin sesión.

Las solicitudes públicas al puerto 3001, incluidas APIs y POST internos, exigen una sesión de Aterum salvo el formulario de login y los recursos estáticos. El WebSocket público de la cuenta también valida la sesión. Los clientes locales continúan usando los contratos internos existentes. No se reinició Windows: falta confirmar el ciclo de arranque automático con un reinicio real de la PC/WSL.
