const { Service, Category } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

// Serializa serviço
const serializeService = (service) => {
  const json = service.toJSON ? service.toJSON() : service;
  return {
    id: json.id,
    name: json.name,
    description: json.description,
    price: Number(json.price),
    category_id: json.category_id,
    category_name: json.category?.name || '',
    estimated_time: json.estimated_time,
    is_available: json.is_available,
    rating: Number(json.rating) || 0,
    review_count: json.review_count || 0,
    images: json.images || [],
    created_at: json.created_at,
    updated_at: json.updated_at
  };
};

const categoryInclude = [{
  model: Category,
  as: 'category',
  attributes: ['id', 'name', 'icon', 'color']
}];

// Listar serviços ATIVOS (cliente)
exports.getAllServices = async (req, res) => {
  try {
    console.log('🔍 Buscando serviços ativos...');
    const services = await Service.findAll({
      where: { is_available: true },
      include: categoryInclude,
      order: [['name', 'ASC']]
    });
    console.log(`✅ Encontrados ${services.length} serviços`);
    res.json(services.map(serializeService));
  } catch (error) {
    console.error('❌ Erro ao buscar serviços:', error);
    res.status(500).json({ error: error.message });
  }
};

// Listar TODOS os serviços (admin)
exports.getAllServicesAdmin = async (req, res) => {
  try {
    console.log('🔍 [Admin] Buscando todos os serviços...');
    const services = await Service.findAll({
      include: categoryInclude,
      order: [['created_at', 'DESC']]
    });
    console.log(`✅ Encontrados ${services.length} serviços`);
    res.json(services.map(serializeService));
  } catch (error) {
    console.error('❌ Erro ao buscar serviços (admin):', error);
    res.status(500).json({ error: error.message });
  }
};

// Buscar serviço por ID
exports.getServiceById = async (req, res) => {
  try {
    const service = await Service.findByPk(req.params.id, {
      include: categoryInclude
    });
    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }
    res.json(serializeService(service));
  } catch (error) {
    console.error('❌ Erro ao buscar serviço:', error);
    res.status(500).json({ error: error.message });
  }
};

// Buscar serviços por categoria
exports.getServicesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    console.log(`🔍 Buscando serviços da categoria: ${categoryId}`);

    const services = await Service.findAll({
      where: { category_id: categoryId },
      include: categoryInclude,
      order: [['name', 'ASC']]
    });

    console.log(`✅ Encontrados ${services.length} serviços`);
    res.json(services.map(serializeService));
  } catch (error) {
    console.error('❌ Erro ao buscar serviços por categoria:', error);
    res.status(500).json({ error: error.message });
  }
};

// Buscar serviços com filtros
exports.searchServices = async (req, res) => {
  try {
    const { q, minPrice, maxPrice, categoryId, available } = req.query;
    console.log('🔍 Buscando serviços com filtros:', { q, minPrice, maxPrice, categoryId });

    const where = {};

    if (q && q.trim() !== '') {
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { description: { [Op.like]: `%${q}%` } }
      ];
    }
    
    if (minPrice && !isNaN(minPrice)) {
      where.price = { ...where.price, [Op.gte]: parseFloat(minPrice) };
    }
    if (maxPrice && !isNaN(maxPrice)) {
      where.price = { ...where.price, [Op.lte]: parseFloat(maxPrice) };
    }
    if (categoryId && categoryId !== '') {
      where.category_id = categoryId;
    }
    if (available === 'true') {
      where.is_available = true;
    }

    const services = await Service.findAll({ 
      where, 
      include: categoryInclude,
      order: [['name', 'ASC']]
    });
    
    console.log(`✅ Encontrados ${services.length} serviços`);
    res.json(services.map(serializeService));
  } catch (error) {
    console.error('❌ Erro ao buscar serviços:', error);
    res.status(500).json({ error: error.message });
  }
};

// Criar serviço (admin)
exports.createService = async (req, res) => {
  try {
    console.log('📝 Criando serviço:', req.body);

    const { name, description, price, category_id, estimated_time, is_available } = req.body;

    if (!name || !price || !category_id) {
      return res.status(400).json({ error: 'Campos obrigatórios: nome, preço e categoria' });
    }

    const category = await Category.findByPk(category_id);
    if (!category) {
      return res.status(400).json({ error: 'Categoria não encontrada' });
    }

    const existing = await Service.findOne({ where: { name } });
    if (existing) {
      return res.status(400).json({ error: 'Já existe um serviço com este nome' });
    }

    const service = await Service.create({
      name,
      description: description || '',
      price: parseFloat(price),
      category_id,
      estimated_time: estimated_time || 60,
      is_available: is_available !== undefined ? is_available : true
    });

    const created = await Service.findByPk(service.id, { include: categoryInclude });
    console.log('✅ Serviço criado:', created.name);
    res.status(201).json(serializeService(created));
  } catch (error) {
    console.error('❌ Erro ao criar serviço:', error);
    res.status(500).json({ error: error.message });
  }
};

// Atualizar serviço (admin)
exports.updateService = async (req, res) => {
  try {
    console.log('📝 Atualizando serviço ID:', req.params.id);

    const service = await Service.findByPk(req.params.id);
    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    if (req.body.category_id) {
      const category = await Category.findByPk(req.body.category_id);
      if (!category) {
        return res.status(400).json({ error: 'Categoria não encontrada' });
      }
    }

    if (req.body.name && req.body.name !== service.name) {
      const existing = await Service.findOne({
        where: { 
          name: req.body.name, 
          id: { [Op.ne]: req.params.id }
        }
      });
      if (existing) {
        return res.status(400).json({ error: 'Já existe outro serviço com este nome' });
      }
    }

    if (req.body.price) {
      req.body.price = parseFloat(req.body.price);
    }

    await service.update(req.body);

    const updated = await Service.findByPk(req.params.id, { include: categoryInclude });
    console.log('✅ Serviço atualizado:', updated.name);
    res.json(serializeService(updated));
  } catch (error) {
    console.error('❌ Erro ao atualizar serviço:', error);
    res.status(500).json({ error: error.message });
  }
};

// Deletar serviço (admin)
exports.deleteService = async (req, res) => {
  try {
    console.log('🗑️ Deletando serviço ID:', req.params.id);

    const service = await Service.findByPk(req.params.id);
    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    const serviceName = service.name;
    await service.destroy();

    console.log('✅ Serviço deletado:', serviceName);
    res.json({ 
      success: true,
      message: 'Serviço deletado com sucesso', 
      id: req.params.id, 
      name: serviceName 
    });
  } catch (error) {
    console.error('❌ Erro ao deletar serviço:', error);
    res.status(500).json({ error: error.message });
  }
};

// Ativar/Desativar serviço (admin)
exports.toggleServiceStatus = async (req, res) => {
  try {
    console.log('🔄 Alterando status do serviço ID:', req.params.id);

    const service = await Service.findByPk(req.params.id);
    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    const newStatus = !service.is_available;
    await service.update({ is_available: newStatus });

    const updated = await Service.findByPk(req.params.id, { include: categoryInclude });
    console.log(`✅ Serviço ${newStatus ? 'ativado' : 'desativado'}:`, service.name);
    res.json(serializeService(updated));
  } catch (error) {
    console.error('❌ Erro ao alterar status do serviço:', error);
    res.status(500).json({ error: error.message });
  }
};

// Buscar serviços do prestador
exports.getProviderServices = async (req, res) => {
  try {
    const providerId = req.params.id || req.user.id;
    
    const services = await Service.findAll({
      where: { is_available: true },
      include: categoryInclude,
      order: [['name', 'ASC']]
    });
    
    res.json({
      success: true,
      data: services.map(serializeService)
    });
  } catch (error) {
    console.error('❌ Erro ao buscar serviços do prestador:', error);
    res.status(500).json({ error: error.message });
  }
};