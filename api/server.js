const venom = require('venom-bot');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const session = require('express-session');
const path = require('path');
require('dotenv').config(); // Carrega as variáveis do arquivo .env

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",  // Permite conexões de qualquer domínio (mude conforme necessário)
        methods: ["GET", "POST"]
    }
});
const upload = multer({ storage: multer.memoryStorage() }); // Armazena o vídeo apenas na RAM

app.use(session({
    secret: 'meu-segredo',
    resave: false,
    saveUninitialized: true
}));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static('public'));

let client;
let botAtivo = false;
let caminhoArquivoExcel = '';
let caminhoVideo = ''; // Agora armazenamos o vídeo como Base64

// Middleware para autenticação
function verificarAutenticacao(req, res, next) {
    if (req.session.authenticated) {
        next();
    } else {
        res.redirect('/login.html');
    }
}


app.get('/api/hello', (req, res) => {
    res.json({ message: "Hello from Vercel!" });
});

// Exporta a função handler
module.exports = app;


// Rota principal
module.exports = async (req, res) => {
    if (req.method === "POST") {
      if (req.url === "/start-bot") {
        botAtivo = true;
        await iniciarBot();
        res.json({ status: "Bot iniciado" });
      } else if (req.url === "/stop-bot") {
        botAtivo = false;
        res.json({ status: "Bot parado" });
      } else if (req.url === "/send-video") {
        const resultado = await enviarVideos();
        res.json(resultado);
      } else {
        res.status(404).json({ error: "Rota não encontrada" });
      }
    } else {
      res.json({ message: "API do WhatsApp Bot rodando na Vercel!" });
    }
  };

// Rota inicial (Home)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});
// Usuários de login (mock)
const usuarios = [{ username: 'admin', password: '1234' }];

// Rota para login
app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const usuario = usuarios.find(u => u.username === username && u.password === password);

    if (usuario) {
        req.session.authenticated = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "Usuário ou senha inválidos." });
    }
});


// Upload do arquivo Excel
app.post('/upload', upload.single('arquivo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ mensagem: "Nenhum arquivo enviado." });
    }

    caminhoArquivoExcel = req.file.buffer;
    console.log("📂 Arquivo Excel recebido e processado.");

    res.json({ mensagem: "Arquivo recebido com sucesso!" });
});

// Upload do vídeo sem salvar no servidor
app.post('/upload-video', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ mensagem: "Nenhum vídeo enviado." });
    }

    try {
        console.log("📂 Vídeo recebido, processando...");

        // Converte o buffer do vídeo para Base64
        const videoBase64 = req.file.buffer.toString('base64');
        caminhoVideo = `data:video/mp4;base64,${videoBase64}`;

        const mensagemRecebida = req.body.mensagem || "Aqui está seu vídeo!"; // Captura a mensagem
        console.log("Mensagem recebida:", mensagemRecebida); // Adicione esse log para debugar
        global.mensagemPersonalizada = mensagemRecebida; // Salva a mensagem globalmente

        console.log("✅ Vídeo pronto para envio com a mensagem:", mensagemRecebida);

        console.log("✅ Vídeo pronto para envio!");

        res.json({ mensagem: "Vídeo recebido e pronto para envio!" });

    } catch (error) {
        console.error("❌ Erro ao processar vídeo:", error);
        res.status(500).json({ mensagem: "Erro ao processar vídeo." });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login.html');
    });
});

// WebSockets
io.on('connection', (socket) => {
    console.log('📡 Cliente conectado via Socket.IO');

    socket.on('startBot', async () => {
        botAtivo = true;
        console.log('Bot ativado!');
        socket.emit('status', 'Bot está ativo! Enviando vídeos...');
        await enviarVideosParaLista();
    });

    socket.on('stopBot', () => {
        botAtivo = false;
        console.log('Bot desativado!');
        socket.emit('status', 'Bot está inativo!');
    });

    // Evento solicitarNovoQrCode
    socket.on('solicitarNovoQrCode', async () => {
        console.log('🔄 Novo QR Code solicitado!');
        try {
            await venom.create(
                'bot-session',
                (base64Qr) => {
                    console.log('🟢 Novo QR Code gerado!');
                    io.emit('qrCode', base64Qr); // Envia o QR Code para o frontend
                },
                (statusSession) => {
                    console.log('📢 Status da sessão:', statusSession);
                    io.emit('status', statusSession);
                },
                {
                    multidevice: true,
                    folderNameToken: 'tokens',
                    logQR: false,
                    browserArgs: [
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--headless",
                        "--disable-dev-shm-usage",
                        "--remote-debugging-port=9222",
                        "--disable-software-rasterizer",
                        "--disable-gpu",
                        "--window-size=1280x800"
                    ]
                }
            );
        } catch (error) {
            console.log('❌ Erro ao gerar novo QR Code:', error);
            io.emit('status', 'Erro ao gerar QR Code. Tente novamente.');
        }
    });

});

// Função para ler os números do Excel
function lerNumerosDoExcel() {
    try {
        const workbook = xlsx.read(caminhoArquivoExcel, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        const numeros = data.map(row => row['Número'].toString().replace(/\D/g, '') + '@c.us');
        return [...new Set(numeros)]; // Remove duplicatas
    } catch (error) {
        console.error('Erro ao ler o arquivo Excel:', error);
        return [];
    }
}




// Iniciando o Venom Bot

venom.create(
    'bot-session',
    (base64Qr) => {
        console.log('🟢 QR Code gerado! Enviando ao frontend...');
        io.emit('qrCode', base64Qr); // Envia o QR Code para o front-end via WebSocket
    },
    (statusSession) => {
        console.log('📢 Status da sessão:', statusSession);
        io.emit('status', statusSession); // Envia o status da sessão ao front-end
    },
    {
        multidevice: true,
        folderNameToken: 'tokens',
        logQR: false, // Desativa a exibição do QR Code no terminal
        browserArgs: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-software-rasterizer",
            "--remote-debugging-port=9222"
        ]
    })
.then((bot) => {
    client = bot;
    console.log('✅ Bot iniciado! Escaneie o QR Code.');
    io.emit('status', 'Aguardando as tarefas...');

     
}).catch((error) => {
    console.log('❌ Erro ao iniciar o bot:', error);
});





server.listen(3000, () => {
    console.log('Servidor rodando em http://localhost:3000');
});

// Função para enviar vídeos sem salvar no servidor
async function enviarVideosParaLista() {
    if (!botAtivo) return;

    const numeros = lerNumerosDoExcel();
    if (numeros.length === 0) {
        console.log('Nenhum número encontrado no Excel.');
        return;
    }

    if (!caminhoVideo) {
        console.log('⚠️ Nenhum vídeo foi recebido para envio.');
        return;
    }

    const mensagemFinal = global.mensagemPersonalizada || "Aqui está seu vídeo!"; // Usa a mensagem do usuário


    console.log(`📢 Enviando vídeo para ${numeros.length} números...`);
    // Enviar para o cliente
    io.emit('status', `📢 Enviando vídeo para ${numeros.length} números...`);

    for (let i = 0; i < numeros.length; i++) {
        if (!botAtivo) break;

        try {
            await client.sendFileFromBase64(numeros[i], caminhoVideo, 'video.mp4', mensagemFinal);
            console.log(`✅ Vídeo enviado para ${numeros[i]}`);

            // Enviar o progresso para o cliente
            io.emit('progress', `Enviando mensagem ${i + 1}/${numeros.length}...`);
        } catch (error) {
            console.log(`❌ Erro ao enviar para ${numeros[i]}:`, error);
        }}

    //     // Pausa entre envios
    //     await new Promise(resolve => setTimeout(resolve, 2000));
    // }

    // Gerar intervalos aleatórios entre 2 e 7 segundos
    let intervalos = [];
    for (let i = 0; i < numeros.length; i++) {
        intervalos.push(Math.floor(Math.random() * 11) + 10); // Gera números entre 2 e 7
    }

    // Embaralhar os intervalos
    intervalos = intervalos.sort(() => Math.random() - 0.5);

    for (let i = 0; i < numeros.length; i++) {
        if (!botAtivo) break;

        try {
            await client.sendFileFromBase64(numeros[i], caminhoVideo, 'video.mp4', mensagemFinal);
            console.log(`✅ Vídeo enviado para ${numeros[i]}`);

            // Aguardar o intervalo aleatório antes de enviar a próxima mensagem
            const intervalo = intervalos[i] * 1000; // Convertendo para milissegundos
            console.log(`Esperando ${intervalo / 1000} segundos antes de enviar a próxima mensagem.`);
            await new Promise(resolve => setTimeout(resolve, intervalo)); // Pausa entre envios
        } catch (error) {
            console.log(`❌ Erro ao enviar para ${numeros[i]}:`, error);
        }
    }




    // // Definir o intervalo mínimo de 5 segundos entre os envios para evitar problemas
    // const intervaloEnvio = 5000;  // 5 segundos entre cada envio

    // // Enviar em lotes de 20 mensagens por vez
    // const tamanhoLote = 20;
    // let loteAtual = 0;

    // while (loteAtual * tamanhoLote < numeros.length) {
    //     const lote = numeros.slice(loteAtual * tamanhoLote, (loteAtual + 1) * tamanhoLote);
    //     console.log(`Enviando lote ${loteAtual + 1}/${Math.ceil(numeros.length / tamanhoLote)}...`);

    //     for (let i = 0; i < lote.length; i++) {
    //         if (!botAtivo) break;

    //         try {
    //             await client.sendFileFromBase64(lote[i], caminhoVideo, 'video.mp4', mensagemFinal);
    //             console.log(`✅ Vídeo enviado para ${lote[i]}`);

    //             // Enviar o progresso para o cliente
    //             io.emit('progress', `Enviando mensagem ${loteAtual * tamanhoLote + i + 1}/${numeros.length}...`);
    //         } catch (error) {
    //             console.log(`❌ Erro ao enviar para ${lote[i]}:`, error);
    //         }

    //         // Pausa entre envios de cada mensagem dentro do lote
    //         await new Promise(resolve => setTimeout(resolve, intervaloEnvio));
    //     }

    //     // Pausa entre os lotes
    //     await new Promise(resolve => setTimeout(resolve, 10000)); // Pausa de 10 segundos entre os lotes
    //     loteAtual++;
    // }

    console.log('📤 Envio concluído!');
    io.emit('status', '📤 Envio concluído!');
    io.emit('progress', `Mensagens concluídas ${numeros.length}/${numeros.length}`);
}
