import Role from "../models/role.js";
import handleResponse from "../utils/helper.js";

export const createRole = async (req, res) => {
  try {
    const { name, modules } = req.body;
    
    if (!name) {
      return handleResponse(res, 400, "Role name is required");
    }

    const duplicate = await Role.findOne({ name });
    if (duplicate) {
      return handleResponse(res, 409, "Role with this name already exists");
    }

    const role = await Role.create({
      name,
      modules: modules || [],
      createdBy: req.user.id,
    });

    return handleResponse(res, 201, "Role created successfully", role);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getRoles = async (req, res) => {
  try {
    const roles = await Role.find().populate("createdBy", "name email");
    return handleResponse(res, 200, "Roles fetched successfully", roles);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getRoleById = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return handleResponse(res, 404, "Role not found");
    }
    return handleResponse(res, 200, "Role fetched successfully", role);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateRole = async (req, res) => {
  try {
    const { name, modules } = req.body;
    
    const role = await Role.findById(req.params.id);
    if (!role) {
      return handleResponse(res, 404, "Role not found");
    }

    if (name) role.name = name;
    if (modules) role.modules = modules;

    await role.save();

    return handleResponse(res, 200, "Role updated successfully", role);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const deleteRole = async (req, res) => {
  try {
    const role = await Role.findByIdAndDelete(req.params.id);
    if (!role) {
      return handleResponse(res, 404, "Role not found");
    }
    // Might want to check if admins are using this role before deleting
    return handleResponse(res, 200, "Role deleted successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
