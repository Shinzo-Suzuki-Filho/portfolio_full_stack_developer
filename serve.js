require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const mercadopago = require('mercadopago');
const axios = require('axios'); // Para a função de enviar mensagem

const app = express();
const port = process.env.PORT || 3000;

// --- Configuração do Banco de Dados (PostgreSQL) ---
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// --- Configuração do Mercado Pago ---
mercadopago.configure({
    access_token: process.env.MERCADO_PAGO_ACCESS_TOKEN,
});

// Middleware
app.use(express.json());

/**
 * Função mock para simular o envio de confirmação (Email/WhatsApp)
 * VOCÊ DEVE IMPLEMENTAR ISSO COM SERVIÇOS REAIS (SendGrid, Twilio, etc.)
 * @param {string} email - E-mail do cliente
 * @param {string} nome - Nome do cliente
 * @param {string} status - Status do pagamento ('approved', 'rejected', etc.)
 */
const enviarConfirmacao = async (email, nome, status) => {
    try {
        if (status === 'APPROVED') {
            console.log(`[SUCESSO] Enviando confirmação de APROVAÇÃO para ${nome} (${email}).`);
            // Ex: Implementação real para enviar e-mail
            // await axios.post('https://api.sendgrid.com/v3/mail/send', { ... }); 
        } else if (status === 'REJECTED') {
            console.log(`[ALERTA] Enviando notificação de REJEIÇÃO para ${nome} (${email}).`);
        }
        return true;
    } catch (error) {
        console.error("Erro ao tentar enviar confirmação:", error.message);
        return false;
    }
};

// --- ROTA DE WEBHOOK (IPN - Instant Payment Notification) ---
app.post('/api/pagamento/webhook', async (req, res) => {
    // 1. Validar notificação do Mercado Pago
    if (!req.query.topic || req.query.topic !== 'payment') {
        return res.status(400).send('Tópico inválido');
    }

    const mp_id = req.query.id; // ID do pagamento enviado pelo MP

    let client;
    try {
        // 2. Buscar detalhes da transação no Mercado Pago
        const paymentData = await mercadopago.payment.get(mp_id);
        const payment = paymentData.body;

        const external_reference = payment.external_reference;
        const status = payment.status.toUpperCase(); // APPROVED, PENDING, REJECTED
        const meio_pagamento = payment.payment_type_id.toUpperCase();

        if (!external_reference) {
            console.error("Referência externa não encontrada no pagamento MP:", mp_id);
            return res.status(400).send('Referência externa ausente');
        }

        // 3. Buscar e Atualizar a Transação no seu Banco de Dados
        const client = await pool.connect();
        await client.query('BEGIN'); // Inicia Transação DB

        // Busca o registro para garantir que existe e não foi processado
        const transacaoQuery = await client.query(
            `SELECT t.id, t.cliente_id, t.status_pagamento, t.notificacao_enviada, c.email, c.nome 
             FROM transacoes t 
             JOIN clientes c ON t.cliente_id = c.id 
             WHERE t.external_reference = $1 FOR UPDATE`, // FOR UPDATE: Evita processamento concorrente
            [external_reference]
        );

        const transacao = transacaoQuery.rows[0];

        if (!transacao) {
            await client.query('ROLLBACK');
            return res.status(404).send('Transação não encontrada no DB.');
        }

        // 4. Lógica de Atualização e Confirmação
        if (status === 'APPROVED' && transacao.status_pagamento !== 'APPROVED') {
            // Atualiza status para APROVADO
            await client.query(
                `UPDATE transacoes 
                 SET status_pagamento = $1, data_aprovacao = NOW(), meio_pagamento = $2
                 WHERE id = $3`,
                [status, meio_pagamento, transacao.id]
            );
            
            // Envia Confirmação APENAS se ainda não foi enviada
            if (!transacao.notificacao_enviada) {
                const enviado = await enviarConfirmacao(transacao.email, transacao.nome, status);
                if (enviado) {
                    await client.query(`UPDATE transacoes SET notificacao_enviada = TRUE WHERE id = $1`, [transacao.id]);
                }
            }
        } 
        
        // Tratar outros status (PENDING, REJECTED, CANCELED)
        else if (status !== transacao.status_pagamento) {
             await client.query(
                `UPDATE transacoes SET status_pagamento = $1 WHERE id = $2`,
                [status, transacao.id]
            );
             // Se rejeitado, também podemos enviar uma notificação
             if (status === 'REJECTED' && !transacao.notificacao_enviada) {
                 const enviado = await enviarConfirmacao(transacao.email, transacao.nome, status);
                 if (enviado) {
                    await client.query(`UPDATE transacoes SET notificacao_enviada = TRUE WHERE id = $1`, [transacao.id]);
                 }
             }
        }
        
        await client.query('COMMIT'); // Finaliza Transação DB com sucesso
        res.status(200).send('Webhook processado com sucesso.');

    } catch (error) {
        // Se a transação DB falhar, tenta dar ROLLBACK
        if (client) await client.query('ROLLBACK'); 
        console.error("Erro no processamento do Webhook:", error.message);
        res.status(500).send('Erro interno do servidor');
    } finally {
        if (client) client.release();
    }
});


// Rota de Teste Simples
app.get('/', (req, res) => {
    res.send('API de Pagamento e Webhook está rodando.');
});


// Inicia o Servidor
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
    console.log('Certifique-se de configurar o Webhook do Mercado Pago para:');
    console.log(`[SEU_DOMINIO]/api/pagamento/webhook`);
});