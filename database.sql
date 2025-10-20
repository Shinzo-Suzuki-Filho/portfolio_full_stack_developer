-- 1. Tabela de Clientes (Para registrar quem comprou)
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    telefone VARCHAR(20),
    data_cadastro DATETIME DEFAULT GETDATE()
);

-- 2. Tabela de Transações (Para registrar o pagamento e status)
CREATE TABLE transacoes (
    id SERIAL PRIMARY KEY,
    cliente_id INT REFERENCES clientes(id),
    mp_id VARCHAR(255) UNIQUE NOT NULL,    -- ID da Transação no Mercado Pago
    external_reference VARCHAR(255) UNIQUE NOT NULL, -- Referência Única do seu sistema (Pode ser o ID da compra)
    produto_servico VARCHAR(255) NOT NULL,
    valor DECIMAL(10, 2) NOT NULL,
    meio_pagamento VARCHAR(50),
    status_pagamento VARCHAR(50) DEFAULT 'PENDING' CHECK (status_pagamento IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED')),
    data_criacao DATETIME DEFAULT GETDATE(),
    data_aprovacao DATETIME,
    notificacao_enviada BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_transacoes_cliente_id ON transacoes(cliente_id);