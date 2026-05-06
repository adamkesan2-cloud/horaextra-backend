const { Category, Service } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

// Listar todas as categorias
exports.getAllCategories = async (req, res) => {
  try {
    console.log('🔍 Buscando categorias...');
    const categories = await Category.findAll({
      order: [['order', 'ASC'], ['name', 'ASC']]
    });
    console.log(`✅ Encontradas ${categories.length} categorias`);
    res.json(categories);
  } catch (error) {
    console.error('❌ Erro ao buscar categorias:', error);
    res.status(500).json({ error: error.message });
  }
};

// Buscar categoria por ID
exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }
    res.json(category);
  } catch (error) {
    console.error('❌ Erro ao buscar categoria:', error);
    res.status(500).json({ error: error.message });
  }
};

// Buscar serviços por categoria
exports.getCategoryServices = async (req, res) => {
  try {
    const services = await Service.findAll({
      where: {
        category_id: req.params.id
      },
      include: [{
        model: Category,
        as: 'category',
        attributes: ['name', 'icon', 'color']
      }],
      order: [['name', 'ASC']]
    });
    
    res.json({
      success: true,
      data: services
    });
  } catch (error) {
    console.error('❌ Erro ao buscar serviços da categoria:', error);
    res.status(500).json({ error: error.message });
  }
};

// Criar categoria (admin)
exports.createCategory = async (req, res) => {
  try {
    console.log('📝 Criando categoria:', req.body);
    
    const { name, description, icon, color, image_url, order } = req.body;
    
    const existing = await Category.findOne({ where: { name } });
    if (existing) {
      return res.status(400).json({ error: 'Categoria já existe' });
    }
    
    const category = await Category.create({
      name,
      description: description || '',
      icon: icon || 'category',
      color: color || '#1E3A5F',
      image_url: image_url,
      order: order || 0,
      is_active: true
    });
    
    console.log('✅ Categoria criada:', category.name);
    
    res.status(201).json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('❌ Erro ao criar categoria:', error);
    res.status(500).json({ error: error.message });
  }
};

// Atualizar categoria (admin)
exports.updateCategory = async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }
    
    if (req.body.name && req.body.name !== category.name) {
      const existing = await Category.findOne({ 
        where: { 
          name: req.body.name,
          id: { [Op.ne]: req.params.id }
        } 
      });
      if (existing) {
        return res.status(400).json({ error: 'Já existe outra categoria com este nome' });
      }
    }
    
    await category.update(req.body);
    
    const updated = await Category.findByPk(req.params.id);
    
    console.log('✅ Categoria atualizada:', updated.name);
    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar categoria:', error);
    res.status(500).json({ error: error.message });
  }
};

// Deletar categoria (admin)
exports.deleteCategory = async (req, res) => {
  try {
    console.log('🗑️ Deletando categoria ID:', req.params.id);
    
    const category = await Category.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }
    
    const servicesCount = await Service.count({ 
      where: { category_id: req.params.id } 
    });
    
    if (servicesCount > 0) {
      return res.status(400).json({ 
        error: `Não é possível deletar. Existem ${servicesCount} serviços nesta categoria.` 
      });
    }
    
    const categoryName = category.name;
    await category.destroy();
    
    console.log('✅ Categoria deletada com sucesso:', categoryName);
    res.json({ 
      success: true,
      message: 'Categoria deletada com sucesso',
      id: req.params.id,
      name: categoryName
    });
  } catch (error) {
    console.error('❌ Erro ao deletar categoria:', error);
    res.status(500).json({ error: error.message });
  }
};

// Ativar/Desativar categoria (admin)
exports.toggleCategoryStatus = async (req, res) => {
  try {
    console.log('🔄 Alterando status da categoria ID:', req.params.id);
    
    const category = await Category.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }
    
    const newStatus = !category.is_active;
    await category.update({ is_active: newStatus });
    
    const updatedCategory = await Category.findByPk(req.params.id);
    
    console.log(`✅ Categoria ${newStatus ? 'ativada' : 'desativada'}:`, category.name);
    
    res.json({
      success: true,
      data: updatedCategory
    });
  } catch (error) {
    console.error('❌ Erro ao alterar status da categoria:', error);
    res.status(500).json({ error: error.message });
  }
};

// Reordenar categorias (admin)
exports.reorderCategories = async (req, res) => {
  try {
    const { categories } = req.body;
    
    if (!Array.isArray(categories)) {
      return res.status(400).json({ error: 'Formato inválido' });
    }
    
    for (const item of categories) {
      await Category.update(
        { order: item.order },
        { where: { id: item.id } }
      );
    }
    
    console.log(`✅ Categorias reordenadas`);
    res.json({ 
      success: true,
      message: 'Categorias reordenadas com sucesso' 
    });
  } catch (error) {
    console.error('❌ Erro ao reordenar categorias:', error);
    res.status(500).json({ error: error.message });
  }
};

// Buscar categorias populares
exports.getPopularCategories = async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    
    const categories = await Category.findAll({
      where: { is_active: true },
      limit: parseInt(limit),
      order: [['order', 'ASC']]
    });
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('❌ Erro ao buscar categorias populares:', error);
    res.status(500).json({ error: error.message });
  }
};

// Buscar estatísticas das categorias
exports.getCategoryStats = async (req, res) => {
  try {
    const total = await Category.count();
    const active = await Category.count({ where: { is_active: true } });
    
    const categoriesWithServices = await Category.findAll({
      include: [{
        model: Service,
        as: 'services',
        attributes: []
      }],
      attributes: [
        'id',
        'name',
        [Sequelize.fn('COUNT', Sequelize.col('services.id')), 'serviceCount']
      ],
      group: ['Category.id']
    });
    
    res.json({ 
      success: true,
      data: {
        total,
        active,
        inactive: total - active,
        details: categoriesWithServices
      }
    });
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: error.message });
  }
};