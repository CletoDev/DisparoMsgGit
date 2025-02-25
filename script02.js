document.addEventListener("DOMContentLoaded", () => {
    const socket = io.connect("http://localhost:3000");
    const statusBox = document.getElementById("status");
    const logList = document.getElementById("logList");
    const qrCodeImg = document.getElementById("qrCode");

    function logMessage(message) {
        const logItem = document.createElement("li");
        logItem.textContent = message;
        logList.appendChild(logItem);
    }

    document.getElementById("startBot").addEventListener("click", () => {
        socket.emit("startBot");
        logMessage("🟢 Bot iniciado!");
    });

    document.getElementById("stopBot").addEventListener("click", () => {
        socket.emit("stopBot");
        logMessage("🔴 Bot parado!");
    });

    document.getElementById("logout").addEventListener("click", () => {
        fetch("/logout", { method: "POST" })
            .then(() => {
                window.location.href = "/login.html";
            });
    });

    socket.on("status", (msg) => {
        statusBox.textContent = `Status: ${msg}`;
        logMessage(`ℹ️ ${msg}`);
    });

    socket.on("qrCode", (qrCode) => {
        qrCodeImg.src = qrCode;
        qrCodeImg.style.display = "block";
        logMessage("📷 QR Code atualizado!");
    });

    fetch("/verificar-sessao")
        .then(response => response.json())
        .then(data => {
            if (!data.autenticado) {
                window.location.href = "/login.html";
            }
        });

    // Upload de Arquivo Excel
    document.getElementById("uploadFile").addEventListener("click", () => {
        const fileInput = document.getElementById("fileInput");
        const file = fileInput.files[0];
        if (!file) {
            alert("Selecione um arquivo primeiro.");
            return;
        }
        const formData = new FormData();
        formData.append("arquivo", file);
        fetch("/upload", { method: "POST", body: formData })
            .then(response => response.json())
            .then(data => {
                logMessage(`✅ Arquivo enviado: ${file.name}`);
            })
            .catch(error => logMessage("❌ Erro ao enviar arquivo"));
    });

    // Upload de Vídeo
    document.getElementById("uploadVideo").addEventListener("click", () => {
        const videoInput = document.getElementById("videoInput");
        const videoFile = videoInput.files[0];
        const mensagem = document.getElementById("mensagem").value;
        if (!videoFile) {
            alert("Selecione um vídeo primeiro.");
            return;
        }
        const formData = new FormData();
        formData.append("video", videoFile);
        formData.append("mensagem", mensagem);
        fetch("/upload-video", { method: "POST", body: formData })
            .then(response => response.json())
            .then(data => {
                logMessage(`🎥 Vídeo enviado: ${videoFile.name}`);
            })
            .catch(error => logMessage("❌ Erro ao enviar vídeo"));
    });
});
