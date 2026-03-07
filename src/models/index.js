const User = require("./User");
const Menu = require("./Menu");
const MenuItem = require("./MenuItem");
const Address = require("./Address");
const Cart = require("./Cart");
const CartLine = require("./CartLine");
const Order = require("./Order");
const OrderLine = require("./OrderLine");
const Transaction = require("./Transaction");
const Shipping = require("./Shipping");
const PaymentMethod = require("./PaymentMethod");
const UserGatewayProfile = require("./UserGatewayProfile");
const Post = require("./Post");

const ProductType = require("./ProductType");
const ProductCategory = require("./ProductCategory");
const Tag = require("./Tag");
const Product = require("./Product");
const ProductVariant = require("./ProductVariant");
const ProductPrice = require("./ProductPrice");
const ProductTag = require("./ProductTag");
const Collection = require("./Collection");
const ProductCollection = require("./ProductCollection");
const MetaObject = require("./MetaObject");
const ProductMetaObject = require("./ProductMetaObject");
const Media = require("./Media");
const ProductMedia = require("./ProductMedia");
const CollectionMedia = require("./CollectionMedia");
const Event = require("./Event");
const RefundRequest = require("./RefundRequest");
const Registration = require("./Registration");
const AdminZoomAccount = require("./AdminZoomAccount");
const EventMeeting = require("./EventMeeting");
const Invoice = require("./Invoice");
const ProcessedStripeEvent = require("./ProcessedStripeEvent");

// --- Menu <-> MenuItem ---
Menu.hasMany(MenuItem, { foreignKey: "menuId" });
MenuItem.belongsTo(Menu, { foreignKey: "menuId" });
MenuItem.hasMany(MenuItem, { as: "children", foreignKey: "parentId" });
MenuItem.belongsTo(MenuItem, { as: "parent", foreignKey: "parentId" });

// --- Address ---
User.hasMany(Address, { foreignKey: "userId" });
Address.belongsTo(User, { foreignKey: "userId" });

// --- Product type & category ---
ProductType.hasMany(Product, { foreignKey: "productTypeId" });
Product.belongsTo(ProductType, { foreignKey: "productTypeId" });
ProductCategory.hasMany(Product, { foreignKey: "productCategoryId" });
Product.belongsTo(ProductCategory, { foreignKey: "productCategoryId" });

// --- Product & variants & price (Product has many variants; each product gets a default variant on create) ---
Product.hasMany(ProductVariant, { foreignKey: "productId", as: "ProductVariants" });
ProductVariant.belongsTo(Product, { foreignKey: "productId" });
ProductVariant.hasMany(ProductPrice, { foreignKey: "productVariantId" });
ProductPrice.belongsTo(ProductVariant, { foreignKey: "productVariantId" });

// --- Product <-> Tag (ProductTag join) ---
Product.belongsToMany(Tag, { through: ProductTag, foreignKey: "productId", otherKey: "tagId", as: "tags" });
Tag.belongsToMany(Product, { through: ProductTag, foreignKey: "tagId", otherKey: "productId", as: "products" });
Product.hasMany(ProductTag, { foreignKey: "productId" });
ProductTag.belongsTo(Product, { foreignKey: "productId" });
Tag.hasMany(ProductTag, { foreignKey: "tagId" });
ProductTag.belongsTo(Tag, { foreignKey: "tagId" });

// --- Collection <-> Product (ProductCollection join) ---
Collection.belongsToMany(Product, { through: ProductCollection, foreignKey: "collectionId", otherKey: "productId", as: "products" });
Product.belongsToMany(Collection, { through: ProductCollection, foreignKey: "productId", otherKey: "collectionId", as: "collections" });
Collection.hasMany(ProductCollection, { foreignKey: "collectionId" });
ProductCollection.belongsTo(Collection, { foreignKey: "collectionId" });
Product.hasMany(ProductCollection, { foreignKey: "productId" });
ProductCollection.belongsTo(Product, { foreignKey: "productId" });

// --- MetaObject <-> Product (ProductMetaObject join) ---
MetaObject.belongsToMany(Product, { through: ProductMetaObject, foreignKey: "metaObjectId", otherKey: "productId", as: "products" });
Product.belongsToMany(MetaObject, { through: ProductMetaObject, foreignKey: "productId", otherKey: "metaObjectId", as: "metaObjects" });
MetaObject.hasMany(ProductMetaObject, { foreignKey: "metaObjectId" });
ProductMetaObject.belongsTo(MetaObject, { foreignKey: "metaObjectId" });
Product.hasMany(ProductMetaObject, { foreignKey: "productId" });
ProductMetaObject.belongsTo(Product, { foreignKey: "productId" });

// --- Media <-> Product (ProductMedia join) ---
Media.belongsToMany(Product, { through: ProductMedia, foreignKey: "mediaId", otherKey: "productId", as: "products" });
Product.belongsToMany(Media, { through: ProductMedia, foreignKey: "productId", otherKey: "mediaId", as: "media" });
Media.hasMany(ProductMedia, { foreignKey: "mediaId" });
ProductMedia.belongsTo(Media, { foreignKey: "mediaId" });
Product.hasMany(ProductMedia, { foreignKey: "productId" });
ProductMedia.belongsTo(Product, { foreignKey: "productId" });

// --- Media <-> Collection (CollectionMedia join) ---
Media.belongsToMany(Collection, { through: CollectionMedia, foreignKey: "mediaId", otherKey: "collectionId", as: "collections" });
Collection.belongsToMany(Media, { through: CollectionMedia, foreignKey: "collectionId", otherKey: "mediaId", as: "media" });
Media.hasMany(CollectionMedia, { foreignKey: "mediaId" });
CollectionMedia.belongsTo(Media, { foreignKey: "mediaId" });
Collection.hasMany(CollectionMedia, { foreignKey: "collectionId" });
CollectionMedia.belongsTo(Collection, { foreignKey: "collectionId" });

// --- Event (live sessions; productId + productVariantId) ---
Event.belongsTo(Product, { foreignKey: "productId" });
Product.hasMany(Event, { foreignKey: "productId" });
Event.belongsTo(ProductVariant, { foreignKey: "productVariantId" });
ProductVariant.hasOne(Event, { foreignKey: "productVariantId" });
Event.hasMany(Registration, { foreignKey: "eventId" });
Registration.belongsTo(Event, { foreignKey: "eventId" });
Event.hasOne(EventMeeting, { foreignKey: "eventId" });
EventMeeting.belongsTo(Event, { foreignKey: "eventId" });

// --- Cart & CartLine (line references ProductVariant) ---
User.hasMany(Cart, { foreignKey: "userId" });
Cart.belongsTo(User, { foreignKey: "userId" });
Cart.hasMany(CartLine, { foreignKey: "cartId" });
CartLine.belongsTo(Cart, { foreignKey: "cartId" });
ProductVariant.hasMany(CartLine, { foreignKey: "productVariantId" });
CartLine.belongsTo(ProductVariant, { foreignKey: "productVariantId" });

// --- Order & OrderLine (line references ProductVariant) ---
User.hasMany(Order, { foreignKey: "userId" });
Order.belongsTo(User, { foreignKey: "userId" });
Order.hasMany(OrderLine, { foreignKey: "orderId" });
OrderLine.belongsTo(Order, { foreignKey: "orderId" });
ProductVariant.hasMany(OrderLine, { foreignKey: "productVariantId" });
OrderLine.belongsTo(ProductVariant, { foreignKey: "productVariantId" });
Event.hasMany(OrderLine, { foreignKey: "eventId" });
OrderLine.belongsTo(Event, { foreignKey: "eventId" });
Order.hasMany(Registration, { foreignKey: "orderId" });
Registration.belongsTo(Order, { foreignKey: "orderId" });
OrderLine.hasMany(Registration, { foreignKey: "orderLineId" });
Registration.belongsTo(OrderLine, { foreignKey: "orderLineId" });
User.hasMany(Registration, { foreignKey: "userId" });
Registration.belongsTo(User, { foreignKey: "userId" });

// --- Transaction ---
Order.hasMany(Transaction, { foreignKey: "orderId" });
Transaction.belongsTo(Order, { foreignKey: "orderId" });

// --- Invoice ---
Order.hasOne(Invoice, { foreignKey: "orderId", as: "Invoice" });
Invoice.belongsTo(Order, { foreignKey: "orderId" });

// --- RefundRequest ---
Order.hasMany(RefundRequest, { foreignKey: "orderId" });
RefundRequest.belongsTo(Order, { foreignKey: "orderId" });
User.hasMany(RefundRequest, { as: "RequestedRefunds", foreignKey: "requestedByUserId" });
RefundRequest.belongsTo(User, { as: "RequestedByUser", foreignKey: "requestedByUserId" });
User.hasMany(RefundRequest, { as: "ProcessedRefunds", foreignKey: "processedByUserId" });
RefundRequest.belongsTo(User, { as: "ProcessedByUser", foreignKey: "processedByUserId" });

// --- Shipping ---
Order.hasMany(Shipping, { foreignKey: "orderId" });
Shipping.belongsTo(Order, { foreignKey: "orderId" });
Address.hasMany(Shipping, { foreignKey: "addressId" });
Shipping.belongsTo(Address, { foreignKey: "addressId" });

// --- PaymentMethod ---
User.hasMany(PaymentMethod, { foreignKey: "userId" });
PaymentMethod.belongsTo(User, { foreignKey: "userId" });

// --- UserGatewayProfile (Stripe customer IDs, etc.) ---
User.hasMany(UserGatewayProfile, { foreignKey: "userId" });
UserGatewayProfile.belongsTo(User, { foreignKey: "userId" });

// --- AdminZoomAccount (Zoom OAuth for admins hosting online events) ---
User.hasOne(AdminZoomAccount, { foreignKey: "userId" });
AdminZoomAccount.belongsTo(User, { foreignKey: "userId" });
AdminZoomAccount.hasMany(EventMeeting, { foreignKey: "hostAccountId" });
EventMeeting.belongsTo(AdminZoomAccount, { foreignKey: "hostAccountId" });

module.exports = {
  User,
  Menu,
  MenuItem,
  Address,
  Cart,
  CartLine,
  Order,
  OrderLine,
  Transaction,
  Shipping,
  PaymentMethod,
  UserGatewayProfile,
  Post,
  ProductType,
  ProductCategory,
  Tag,
  Product,
  ProductVariant,
  ProductPrice,
  ProductTag,
  Collection,
  ProductCollection,
  MetaObject,
  ProductMetaObject,
  Media,
  ProductMedia,
  CollectionMedia,
  Event,
  RefundRequest,
  Registration,
  AdminZoomAccount,
  EventMeeting,
  Invoice,
  ProcessedStripeEvent,
};
