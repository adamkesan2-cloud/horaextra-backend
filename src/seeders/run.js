const { sequelize } = require('../config/database');
const User = require('../models/User');
const Category = require('../models/Category');
const Service = require('../models/Service');
const ProviderProfile = require('../models/ProviderProfile');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

const seedDatabase = async () => {
  try {
    // Sincronizar banco de dados
    await sequelize.sync({ force: true });
    logger.info('Banco de dados sincronizado');

    // Criar usuários
    const users = await User.bulkCreate([
      {
        name: 'Admin Sistema',
        email: 'admin@horaextra.com',
        phone: '+258840000001',
        password: await bcrypt.hash('123456', 10),
        role: 'admin',
        is_verified: true,
        email_verified_at: new Date()
      },
      {
        name: 'João Cliente',
        email: 'joao@email.com',
        phone: '+258840000002',
        password: await bcrypt.hash('123456', 10),
        role: 'client',
        is_verified: true,
        email_verified_at: new Date()
      },
      {
        name: 'Maria Cliente',
        email: 'maria@email.com',
        phone: '+258840000003',
        password: await bcrypt.hash('123456', 10),
        role: 'client',
        is_verified: true,
        email_verified_at: new Date()
      },
      {
        name: 'Carlos Prestador',
        email: 'carlos@email.com',
        phone: '+258840000004',
        password: await bcrypt.hash('123456', 10),
        role: 'provider',
        is_verified: true,
        email_verified_at: new Date()
      },
      {
        name: 'Ana Prestadora',
        email: 'ana@email.com',
        phone: '+258840000005',
        password: await bcrypt.hash('123456', 10),
        role: 'provider',
        is_verified: true,
        email_verified_at: new Date()
      },
      {
        name: 'Pedro Prestador',
        email: 'pedro@email.com',
        phone: '+258840000006',
        password: await bcrypt.hash('123456', 10),
        role: 'provider',
        is_verified: true,
        email_verified_at: new Date()
      }
    ]);

    logger.info(`${users.length} usuários criados`);

    // Criar categorias
    const categories = await Category.bulkCreate([
      {
        name: 'Limpeza',
        description: 'Serviços de limpeza residencial e profissional',
        icon: 'cleaning_services',
        color: '#3B82F6',
        order: 1
      },
      {
        name: 'Elétrica',
        description: 'Instalações e reparos elétricos',
        icon: 'electric_bolt',
        color: '#F59E0B',
        order: 2
      },
      {
        name: 'Hidráulica',
        description: 'Encanamento e reparos hidráulicos',
        icon: 'plumbing',
        color: '#10B981',
        order: 3
      },
      {
        name: 'Pintura',
        description: 'Pintura de interiores e exteriores',
        icon: 'format_paint',
        color: '#EF4444',
        order: 4
      },
      {
        name: 'Jardinagem',
        description: 'Cuidados com jardins e áreas verdes',
        icon: 'eco',
        color: '#10B981',
        order: 5
      },
      {
        name: 'Montagem',
        description: 'Montagem de móveis e equipamentos',
        icon: 'construction',
        color: '#8B5CF6',
        order: 6
      },
      {
        name: 'Marcenaria',
        description: 'Serviços de marcenaria e reparos em madeira',
        icon: 'handyman',
        color: '#EC4899',
        order: 7
      },
      {
        name: 'Pets',
        description: 'Cuidados e serviços para animais de estimação',
        icon: 'pets',
        color: '#14B8A6',
        order: 8
      }
    ]);

    logger.info(`${categories.length} categorias criadas`);

    // Criar serviços
    const services = await Service.bulkCreate([
      {
        name: 'Limpeza Residencial Completa',
        description: 'Limpeza completa de residências, incluindo quartos, sala, cozinha e banheiros',
        price: 1500,
        category_id: categories[0].id,
        estimated_time: 180
      },
      {
        name: 'Limpeza Pós-Obra',
        description: 'Limpeza pesada para remoção de resíduos de obra',
        price: 2500,
        category_id: categories[0].id,
        estimated_time: 240
      },
      {
        name: 'Instalação Elétrica Completa',
        description: 'Instalação e manutenção de sistemas elétricos',
        price: 2000,
        category_id: categories[1].id,
        estimated_time: 120
      },
      {
        name: 'Reparo Elétrico',
        description: 'Reparos em instalações elétricas e tomadas',
        price: 800,
        category_id: categories[1].id,
        estimated_time: 60
      },
      {
        name: 'Reparo Hidráulico',
        description: 'Reparos em encanamentos e torneiras',
        price: 1200,
        category_id: categories[2].id,
        estimated_time: 90
      },
      {
        name: 'Instalação Hidráulica',
        description: 'Instalação de sistemas hidráulicos completos',
        price: 1800,
        category_id: categories[2].id,
        estimated_time: 150
      },
      {
        name: 'Pintura de Interiores',
        description: 'Pintura de paredes e tetos internos',
        price: 3000,
        category_id: categories[3].id,
        estimated_time: 360
      },
      {
        name: 'Pintura de Exteriores',
        description: 'Pintura de fachadas e áreas externas',
        price: 4000,
        category_id: categories[3].id,
        estimated_time: 480
      },
      {
        name: 'Manutenção de Jardim',
        description: 'Corte de grama, poda e cuidados gerais',
        price: 1000,
        category_id: categories[4].id,
        estimated_time: 120
      },
      {
        name: 'Projeto de Paisagismo',
        description: 'Design e implantação de jardins',
        price: 2500,
        category_id: categories[4].id,
        estimated_time: 240
      },
      {
        name: 'Montagem de Móveis',
        description: 'Montagem de móveis planejados e comuns',
        price: 900,
        category_id: categories[5].id,
        estimated_time: 90
      },
      {
        name: 'Reparos em Madeira',
        description: 'Consertos e restauração de móveis',
        price: 1100,
        category_id: categories[6].id,
        estimated_time: 120
      },
      {
        name: 'Banho e Tosa',
        description: 'Serviços completos de estética animal',
        price: 700,
        category_id: categories[7].id,
        estimated_time: 90
      },
      {
        name: 'Passeio com Pets',
        description: 'Passeios diários para cães',
        price: 300,
        category_id: categories[7].id,
        estimated_time: 60
      }
    ]);

    logger.info(`${services.length} serviços criados`);

    // Criar perfis de prestadores
    const providerUsers = users.filter(u => u.role === 'provider');
    
    for (let i = 0; i < providerUsers.length; i++) {
      const user = providerUsers[i];
      await ProviderProfile.create({
        user_id: user.id,
        description: 'Profissional experiente e dedicado, comprometido com a qualidade e satisfação do cliente.',
        specialties: i === 0 ? ['Elétrica', 'Hidráulica'] : 
                     i === 1 ? ['Limpeza', 'Organização'] : 
                     ['Pintura', 'Reformas'],
        experience_years: 5 + i,
        completed_jobs: 100 + (i * 50),
        rating: 4.7 + (i * 0.1),
        review_count: 150 + (i * 50),
        response_rate: 98,
        response_time: 30,
        acceptance_rate: 95,
        is_available: true,
        service_radius: 20,
        location: {
          lat: -25.9692 + (i * 0.01),
          lng: 32.5732 - (i * 0.01),
          address: 'Maputo, Moçambique'
        },
        is_approved: true,
        approved_at: new Date()
      });
    }

    logger.info(`${providerUsers.length} perfis de prestadores criados`);

    logger.info('Seed concluído com sucesso!');
    process.exit(0);

  } catch (error) {
    logger.error('Erro ao executar seed:', error);
    process.exit(1);
  }
};

// Executar seed
seedDatabase();