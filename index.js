const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Groq = require('groq-sdk');
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const { WaveFile } = require('wavefile');
const { pipeline } = require('@xenova/transformers');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg');

// Garante que o FFmpeg consiga ser encontrado pelo fluent-ffmpeg no Windows
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
let transcriber = null;

// Inicializa o modelo Whisper em background para o primeiro uso ser rápido
(async () => {
    try {
        console.log("⏳ Carregando IA modelo de Áudio (Whisper)... Isso pode demorar na primeira vez!");
        transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', { quantized: true });
        console.log("✅ IA de Áudio pronta para ouvir!");
    } catch (e) {
        console.error("❌ Falha ao carregar IA de áudio.", e);
    }
})();

// Inicialização da API Cloud (Groq) ultra-rápida
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// Inicialização do Cliente do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(), // Salva a sessão para não precisar ler o QR Code toda hora
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// O seu PROMPT de Mestre do X1
const SYSTEM_PROMPT = `Você é a Bia, atendente focada de uma rede de açaíterias no modelo delivery. 

[REGRA DE IDENTIDADE RIGOROSAS E PERSONALIDADE MEIGA]:
- Você NUNCA diz que é uma inteligência artificial, "assistente virtual", "robô" ou "modelo de linguagem".
- Se perguntarem, você é simplesmente a Bia, a atendente da açaíteria.
- Responda SEMPRE de forma curta, amiga e extremamente carismática. 
- Use linguagem do WhatsApp bem jovem e leve, SEMPRE misturando emojis como 🥰, 💖, 🙏, ✨, 😉 pra passar a sensação de "boa moça".
- Zero vocabulário formal, zero redação de escola. Você é a alma do comércio, prestativa e fofa.
- IMPORTANTE: Se o cliente brincar sobre golpe ou segurança, não dê explicações longas ou defensivas. Apenas ria de forma descontraída (kkk) e diga que recebemos dezenas de pedidos por dia pelo site.

FUNIL DE VENDAS E REGRAS DE ATENDIMENTO:
Sua missão é conduzir o cliente suavemente pelo funil de vendas, respeitando a etapa atual dele.

ETAPA 1: PRIMEIRO CONTATO
- Quando o cliente chamar pela primeira vez: "Oiê, tudo bem? Aqui é a Bia!"
- Sempre pergunte o nome se ainda não souber.
- O objetivo AQUI é criar conexão. NÃO mande o link do cardápio de cara. Espere ele responder.

ETAPA 2: O PEDIDO E O CARDÁPIO
- Quando ele falar que quer pedir, explique que os pedidos saem mais rápido pelo cardápio online pra ele montar do jeitinho dele.
- Envie o link do cardápio: ${process.env.LINK_CARDAPIO}
- REGRA DE OURO: Envie o link APENAS UMA VEZ na conversa pra não ser chata.

ETAPA 3: AUMENTO DE TICKET (SUTIL)
- Sugira coisas rapidinho só quando fizer sentido:
  - "Leva o de 500ml, compensa bem mais kkk 😉"
  - "Sempre falo pra galera jogar um creme de avelã a mais, fica top..."
  - "Lembrando que no PIX rola um descontinho ou um adicional de brinde, tá?"

ETAPA 4: CARRINHO ABANDONADO
- Se o cliente sumir de repente:
- "Conseguiu dar uma olhada no site? Qualquer dúvida na hora de montar só me chamar aqui!"

ETAPA 5: PEDIDO FEITO
- Se o cliente falar que já fez o pedido no link ou perguntar se demora, entenda que a venda rolou. Mude o foco.
- Agradeça: "Show! O pedido já apitou aqui e a gente já tá preparando!"
- NÃO ENCHA O SACO: Encerre a conversa. Não ofereça produtos. Pare de mandar link.

ETAPA 6: COMPROVANTES DE PAGAMENTO (PIX)
- Se o usuário enviar um texto dizendo [COMPROVANTE DE PAGAMENTO DETECTADO] ou [MENSAGEM DE ÁUDIO TRANSCRITA], esse texto foi extraído pelo sistema.
- Se for um COMPROVANTE: analise o valor pago e a data da transação.
- Confirme o recebimento do valor com o cliente de forma fofa: "Uhul! Recebi o comprovante do pix de R$ [valor] aqui na data de hoje! 🥰 Já vou separar seu pedido!".
- Não deixe de confirmar o valor para o cliente ficar tranquilo.`;

// Memória de contexto (histórico) de cada cliente
const userContexts = new Map();
const userMessageQueue = new Map();
const userTimers = new Map();

// Geração do QR Code no Terminal
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('🤖 AGENTE IA: Escaneie o QR Code acima com o seu celular WhatsApp.');
});

// Confirmação de conexão
client.on('ready', () => {
    console.log('✅ Tudo certo! Agente IA Delivery de Açaí conectado e pronto para vender no X1 rodando 100% LOCAL no Ollama!');
});

// Escutando as mensagens
client.on('message', async msg => {
    // Ignora mensagens que vêm de grupos ou status
    if (msg.from === 'status@broadcast' || msg.id.participant) return;

    const chatId = msg.from;

    console.log(`\n💬 Mensagem recebida de ${chatId.split('@')[0]}: ${msg.body}`);

    // Intercepta arquivos de mídia (Fotos, Vídeos e Áudios/Mensagem de voz) ANTES da IA
    if (msg.hasMedia) {
        try {
            const chat = await msg.getChat();
            await chat.sendStateTyping();

            const media = await msg.downloadMedia();
            if (!media) return;

            const mediaDir = path.join(__dirname, 'media');
            if (!fs.existsSync(mediaDir)) {
                fs.mkdirSync(mediaDir);
            }

            const fileName = `${msg.id.id}.${media.mimetype.split('/')[1] || 'bin'}`;
            const filePath = path.join(mediaDir, fileName);
            fs.writeFileSync(filePath, media.data, { encoding: 'base64' });

            let extractedText = '';

            // Lógica para Áudio
            if (msg.type === 'audio' || msg.type === 'ptt') {
                const wavFilePath = path.join(mediaDir, `${msg.id.id}.wav`);

                await new Promise((resolve, reject) => {
                    ffmpeg(filePath)
                        .setFfmpegPath(ffmpegInstaller.path)
                        .toFormat('wav')
                        .audioChannels(1)
                        .audioFrequency(16000)
                        .on('end', resolve)
                        .on('error', reject)
                        .save(wavFilePath);
                });

                // Transcrição com Transformer.JS whisper-tiny (100% offline)

                if (transcriber) {
                    try {
                        let wavBuffer = fs.readFileSync(wavFilePath);
                        let wav = new WaveFile(wavBuffer);
                        wav.toBitDepth('32f');
                        wav.toSampleRate(16000);
                        let audioData = wav.getSamples();

                        if (Array.isArray(audioData)) {
                            if (audioData.length > 0 && typeof audioData[0] !== 'number') {
                                audioData = audioData[0]; // Pega o primeiro canal se for estéreo
                            }
                        }

                        const output = await transcriber(audioData, { chunk_length_s: 30, stride_length_s: 5, language: 'portuguese', task: 'transcribe' });

                        let transcribedContent = output.text ? output.text.trim() : '';

                        if (transcribedContent.toLowerCase() === 'obrigado' || transcribedContent.toLowerCase() === 'obrigada' || transcribedContent.length < 2) {
                            await client.sendMessage(chatId, 'Audio ficou meio mudo aqui! 🥺 Pode repetir rapidinho ou mandar por texto?');
                            fs.unlinkSync(filePath);
                            fs.unlinkSync(wavFilePath);
                            return;
                        }
                        extractedText = `[MENSAGEM DE ÁUDIO TRANSCRITA]: ${transcribedContent}`;
                    } catch (e) {
                        console.error("Erro na transcrição de áudio:", e);
                        extractedText = `[MENSAGEM DE ÁUDIO TRANSCRITA]: (Erro ao transcrever offline. Se Bia perguntar, diga: "Ai desculpa, não consegui entender o áudio direito 🥺 Pode escrever ou repetir de forma mais clara, amor?")`;
                    }
                } else {
                    extractedText = `[MENSAGEM DE ÁUDIO TRANSCRITA]: (Erro ao transcrever offline. Se Bia perguntar, diga: "Ai desculpa, não consegui entender o áudio direito 🥺 Pode escrever ou repetir de forma mais clara, amor?")`;
                }

                // Limpeza
                fs.unlinkSync(filePath);
                fs.unlinkSync(wavFilePath);
            }
            // Lógica para Imagem (Comprovante)
            else if (msg.type === 'image') {
                const { data: { text } } = await Tesseract.recognize(filePath, 'por');
                extractedText = `[COMPROVANTE DE PAGAMENTO DETECTADO (IMAGEM)]:\n${text}`;
                fs.unlinkSync(filePath);
            }
            // Lógica para Arquivo/PDF
            else if (msg.type === 'document' && media.mimetype === 'application/pdf') {
                const dataBuffer = fs.readFileSync(filePath);
                const pdfData = await pdfParse(dataBuffer);
                extractedText = `[COMPROVANTE DE PAGAMENTO DETECTADO (PDF)]:\n${pdfData.text}`;
                fs.unlinkSync(filePath);
            }
            // Outros tipos de mídia
            else {
                await client.sendMessage(chatId, 'Poxa vida, a internet aqui da loja tá super lenta agora e não tá baixando esse tipo de arquivo de jeito nenhum! 🥺 Me conta por escrito o que era, por favorzinho? 💖');
                fs.unlinkSync(filePath);
                return;
            }

            // Atribui o texto extraído para a variável userMessage para o Llama processar
            msg.body = extractedText;
            console.log(`\n💬 Mídia convertida de ${chatId.split('@')[0]}: \n${extractedText}`);

        } catch (err) {
            console.error('❌ Erro ao processar mídia:', err);
            await client.sendMessage(chatId, 'Ops, deu um errinho tentando ler seu arquivo, pode me mandar escrito por favorzinho? 🥰');
            return;
        }
    }

    const userMessage = msg.body;

    // Adiciona a mensagem atual na fila do usuário
    if (!userMessageQueue.has(chatId)) {
        userMessageQueue.set(chatId, []);
    }
    userMessageQueue.get(chatId).push(userMessage);

    // Cancela o timer anterior se existir, para esperar terminar de falar
    if (userTimers.has(chatId)) {
        clearTimeout(userTimers.get(chatId));
    }

    // Define um novo timer de 5 segundos
    userTimers.set(chatId, setTimeout(async () => {
        try {
            const messagesToProcess = userMessageQueue.get(chatId);
            userMessageQueue.delete(chatId);
            userTimers.delete(chatId);

            if (!messagesToProcess || messagesToProcess.length === 0) return;

            const combinedMessage = messagesToProcess.join('\n');
            console.log(`\n📦 Lote processado de ${chatId.split('@')[0]}:\n"${combinedMessage}"`);

            console.log("-> Pegando chat...");
            const chat = await msg.getChat();

            console.log("-> Mandando state typing...");
            await chat.sendStateTyping();

            console.log("-> Configurando histórico...");
            if (!userContexts.has(chatId)) {
                userContexts.set(chatId, [
                    { role: "system", content: SYSTEM_PROMPT }
                ]);
            }

            const chatHistory = userContexts.get(chatId);

            // Adiciona o lote de mensagens combinadas do usuário no histórico
            chatHistory.push({ role: "user", content: combinedMessage });

            // Garante que o histórico não cresça infinitamente (mantém o SYSTEM_PROMPT na posição 0 e os últimos 6 intercâmbios)
            const recentHistory = chatHistory.length > 7
                ? [chatHistory[0], ...chatHistory.slice(-6)]
                : chatHistory;

            let botReply = '';
            try {
                console.log("-> Chamando API Groq...");
                const completion = await groq.chat.completions.create({
                    model: "llama-3.1-8b-instant",
                    messages: recentHistory,
                    temperature: 0.8
                });
                console.log("-> Resposta da Groq gerada.");
                botReply = completion.choices[0].message.content;
            } catch (groqError) {
                console.error('❌ ERRO FATAL GROQ:', groqError.error ? groqError.error : groqError);
                botReply = 'Opa, tivemos uma instabilidade rápida aqui no meu cérebro. Já volto a te responder!';
            }

            // Adiciona a resposta do bot no histórico para manter o contexto
            chatHistory.push({ role: "assistant", content: botReply });

            console.log("-> Enviando mensagem pro WA...");
            await client.sendMessage(chatId, botReply);
            console.log(`🤖 Resposta enviada: ${botReply}`);

        } catch (error) {
            console.error('❌ ERRO CRIPTO NO TIMER GLOBAL:', error);
            try {
                // Tenta avisar pro WhatsApp pelo menos
                await client.sendMessage(chatId, 'Opa, tivemos uma instabilidade rápida aqui no sistema ao compilar suas fotos/mensagens. Falhas técnicas, rs. Já volto a te responder!');
            } catch (e2) { }
        }
    }, 5000)); // Espera 5 segundos de silêncio do usuário antes de enviar pra IA
});

client.initialize();
