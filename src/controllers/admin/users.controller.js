const userService = require("../../services/user.service");
const orderService = require("../../services/order.service");
const addressService = require("../../services/address.service");
const paymentMethodService = require("../../services/paymentMethod.service");
const { validateAdminUserCreate, validateAdminUserUpdate } = require("../../validators/user.schema");
const bcrypt = require("bcrypt");
const logger = require("../../config/logger");

const SALT_ROUNDS = 10;

/**
 * Fetch user detail data (orders, addresses, payment methods) for admin edit view.
 * Returns plain objects; payment methods exclude sensitive stripePaymentMethodId.
 * Orders include both userId-linked and email-matched guest orders.
 */
async function getUserDetailData(user) {
  const userId = user?.id ?? null;
  const email = user?.email ?? null;
  if (!userId && !email) return { orders: [], addresses: [], paymentMethods: [] };
  const [orders, addresses, paymentMethodsRaw] = await Promise.all([
    orderService.listOrdersForUser(userId, email),
    addressService.listByUser(userId),
    paymentMethodService.listByUser(userId),
  ]);
  const ordersPlain = (orders || []).map((o) => (o.get ? o.get({ plain: true }) : o));
  const addressesPlain = (addresses || []).map((a) => (a.get ? a.get({ plain: true }) : a));
  const paymentMethods = (paymentMethodsRaw || []).map((pm) => {
    const p = pm.get ? pm.get({ plain: true }) : pm;
    return {
      id: p.id,
      brand: p.brand,
      last4: p.last4,
      expiryMonth: p.expiryMonth,
      expiryYear: p.expiryYear,
      isDefault: p.isDefault,
    };
  });
  return { orders: ordersPlain, addresses: addressesPlain, paymentMethods };
}

function userPlain(u) {
  return u.get ? u.get({ plain: true }) : u;
}

/** Merge POST body into user for re-rendering the edit form after validation errors. */
function userModelForEditFormErrorFromBody(u, body) {
  const p = userPlain(u);
  const merged = { ...p };
  if (body.email !== undefined) merged.email = body.email;
  if (body.username !== undefined) merged.username = body.username;
  merged.isAdmin = body.isAdmin === "on";
  for (const k of ["forename", "surname", "mobile", "companyName", "companyOib"]) {
    if (body[k] !== undefined) merged[k] = body[k];
  }
  if (body.personType !== undefined) {
    merged.personType = body.personType === "legal" ? "legal" : "private";
  }
  return merged;
}

/** Re-render user for edit form after duplicate email/username (validation already passed). */
function userModelForEditFormAfterValidated(u, data) {
  const p = userPlain(u);
  const { password: _pw, ...profile } = data;
  return { ...p, ...profile, id: p.id };
}

module.exports = {
  async index(req, res) {
    const all = await userService.listUsers();
    const admins = all.filter((u) => u.isAdmin).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const users = all.filter((u) => !u.isAdmin).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.render("admin/users/index", {
      title: "Users",
      admins,
      users,
    });
  },

  async newForm(req, res) {
    res.render("admin/users/form", {
      title: "New User",
      formTitle: "New User",
      user: null,
      isEdit: false,
    });
  },

  async newAdminForm(req, res) {
    res.render("admin/users/form", {
      title: "New Admin",
      formTitle: "New Admin",
      user: { isAdmin: true },
      isEdit: false,
    });
  },

  async create(req, res) {
    const result = validateAdminUserCreate(req.body);
    const formTitle = req.body.isAdmin === "on" ? "New Admin" : "New User";
    const renderFormWithError = (error, userOverrides = {}) =>
      res.status(400).render("admin/users/form", {
        title: formTitle,
        formTitle,
        user: {
          email: (req.body.email || "").trim(),
          username: (req.body.username || "").trim(),
          isAdmin: req.body.isAdmin === "on",
          ...userOverrides,
        },
        isEdit: false,
        error,
      });

    if (!result.ok) return renderFormWithError(result.errors[0].message);

    const { email, username, password, isAdmin, forename, surname, mobile, personType, companyName, companyOib } = result.data;
    const existing = await userService.findByEmail(email);
    if (existing) return renderFormWithError("A user with this email already exists.");

    if (username) {
      const existingUsername = await userService.findByUsername(username);
      if (existingUsername) return renderFormWithError("A user with this username already exists.");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await userService.createUser({
      email,
      username,
      passwordHash,
      isAdmin,
      forename,
      surname,
      mobile,
      personType,
      companyName,
      companyOib,
    });
    try {
      const claimed = await orderService.claimGuestOrdersByEmail(email, user.id);
      if (claimed.length > 0) {
        res.setFlash("success", (isAdmin ? "Admin created." : "User created.") + ` ${claimed.length} guest order(s) linked to this account.`);
      } else {
        res.setFlash("success", isAdmin ? "Admin created." : "User created.");
      }
    } catch (claimErr) {
      logger.warn("Claim guest orders after admin user create failed", { userId: user.id, error: claimErr.message });
      res.setFlash("success", isAdmin ? "Admin created." : "User created.");
    }
    res.redirect((req.adminPrefix || "") + "/users");
  },

  async editForm(req, res) {
    const userId = req.params.id;
    const user = await userService.getUserById(userId);
    if (!user) {
      res.setFlash("error", "User not found.");
      return res.redirect((req.adminPrefix || "") + "/users");
    }
    const { orders, addresses, paymentMethods } = await getUserDetailData(user);
    res.render("admin/users/form", {
      title: "Edit User",
      formTitle: "Edit User",
      user: user.get ? user.get({ plain: true }) : user,
      isEdit: true,
      orders,
      addresses,
      paymentMethods,
    });
  },

  async update(req, res) {
    const { id } = req.params;
    const usersPath = (req.adminPrefix || "") + "/users";
    const user = await userService.getUserById(id);
    if (!user) {
      res.setFlash("error", "User not found.");
      return res.redirect(usersPath);
    }
    const result = validateAdminUserUpdate(req.body);
    if (!result.ok) {
      const u = await userService.getUserById(id);
      const { orders, addresses, paymentMethods } = await getUserDetailData(u);
      return res.status(400).render("admin/users/form", {
        title: "Edit User",
        formTitle: "Edit User",
        user: userModelForEditFormErrorFromBody(u, req.body),
        isEdit: true,
        error: result.errors[0].message,
        orders,
        addresses,
        paymentMethods,
      });
    }
    const { email: newEmail, username: newUsername, password, isAdmin } = result.data;
    const existingEmail = await userService.findByEmail(newEmail);
    if (existingEmail && String(existingEmail.id) !== String(id)) {
      const u = await userService.getUserById(id);
      const { orders, addresses, paymentMethods } = await getUserDetailData(u);
      return res.status(400).render("admin/users/form", {
        title: "Edit User",
        formTitle: "Edit User",
        user: userModelForEditFormAfterValidated(u, result.data),
        isEdit: true,
        error: "A user with this email already exists.",
        orders,
        addresses,
        paymentMethods,
      });
    }
    if (newUsername) {
      const existingUsername = await userService.findByUsername(newUsername);
      if (existingUsername && String(existingUsername.id) !== String(id)) {
        const u = await userService.getUserById(id);
        const { orders, addresses, paymentMethods } = await getUserDetailData(u);
        return res.status(400).render("admin/users/form", {
          title: "Edit User",
          formTitle: "Edit User",
          user: userModelForEditFormAfterValidated(u, result.data),
          isEdit: true,
          error: "A user with this username already exists.",
          orders,
          addresses,
          paymentMethods,
        });
      }
    }
    const { forename, surname, mobile, personType, companyName, companyOib } = result.data;
    const updateData = { email: newEmail, username: newUsername, isAdmin, forename, surname, mobile, personType, companyName, companyOib };
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    }
    await userService.updateUser(id, updateData);
    res.setFlash("success", "User updated.");
    res.redirect(usersPath);
  },

  async delete(req, res) {
    const { id } = req.params;
    const usersPath = (req.adminPrefix || "") + "/users";
    if (req.user && String(req.user.id) === String(id)) {
      res.setFlash("error", "You cannot delete your own account.");
      return res.redirect(usersPath);
    }
    const { deleted, error } = await userService.deleteUser(id);
    if (deleted) {
      res.setFlash("success", "User deleted.");
    } else {
      res.setFlash("error", error || "User not found.");
    }
    res.redirect(usersPath);
  },
};
