import { relations } from "drizzle-orm";
import { tenants, tenantMembers, paymentConfigs } from "./tenants.js";
import { categories, products, productVariants } from "./products.js";
import { customers, customerEvents } from "./customers.js";
import { orders, orderItems, payments } from "./orders.js";
import { inventoryMovements } from "./inventory.js";
import { feedItems, notifications } from "./notifications.js";
import { planPayments } from "./billing.js";
import { suppliers, expenses } from "./erp.js";

// --- Tenant relations ---

export const tenantsRelations = relations(tenants, ({ many }) => ({
  members: many(tenantMembers),
  products: many(products),
  categories: many(categories),
  customers: many(customers),
  orders: many(orders),
  payments: many(payments),
  paymentConfigs: many(paymentConfigs),
  inventoryMovements: many(inventoryMovements),
  customerEvents: many(customerEvents),
  feedItems: many(feedItems),
  notifications: many(notifications),
  planPayments: many(planPayments),
  suppliers: many(suppliers),
  expenses: many(expenses),
}));

export const tenantMembersRelations = relations(tenantMembers, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantMembers.tenantId], references: [tenants.id] }),
}));

export const paymentConfigsRelations = relations(paymentConfigs, ({ one }) => ({
  tenant: one(tenants, { fields: [paymentConfigs.tenantId], references: [tenants.id] }),
}));

// --- Product relations ---

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  tenant: one(tenants, { fields: [categories.tenantId], references: [tenants.id] }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  tenant: one(tenants, { fields: [products.tenantId], references: [tenants.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  variants: many(productVariants),
  orderItems: many(orderItems),
  inventoryMovements: many(inventoryMovements),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  tenant: one(tenants, { fields: [productVariants.tenantId], references: [tenants.id] }),
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));

// --- Customer relations ---

export const customersRelations = relations(customers, ({ one, many }) => ({
  tenant: one(tenants, { fields: [customers.tenantId], references: [tenants.id] }),
  orders: many(orders),
  events: many(customerEvents),
}));

export const customerEventsRelations = relations(customerEvents, ({ one }) => ({
  tenant: one(tenants, { fields: [customerEvents.tenantId], references: [tenants.id] }),
  customer: one(customers, { fields: [customerEvents.customerId], references: [customers.id] }),
}));

// --- Order relations ---

export const ordersRelations = relations(orders, ({ one, many }) => ({
  tenant: one(tenants, { fields: [orders.tenantId], references: [tenants.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  items: many(orderItems),
  payments: many(payments),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  tenant: one(tenants, { fields: [orderItems.tenantId], references: [tenants.id] }),
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  tenant: one(tenants, { fields: [payments.tenantId], references: [tenants.id] }),
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));

// --- Inventory relations ---

export const inventoryMovementsRelations = relations(inventoryMovements, ({ one }) => ({
  tenant: one(tenants, { fields: [inventoryMovements.tenantId], references: [tenants.id] }),
  product: one(products, { fields: [inventoryMovements.productId], references: [products.id] }),
}));

// --- Feed & Notification relations ---

export const feedItemsRelations = relations(feedItems, ({ one }) => ({
  tenant: one(tenants, { fields: [feedItems.tenantId], references: [tenants.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  tenant: one(tenants, { fields: [notifications.tenantId], references: [tenants.id] }),
}));

export const planPaymentsRelations = relations(planPayments, ({ one }) => ({
  tenant: one(tenants, { fields: [planPayments.tenantId], references: [tenants.id] }),
}));

// --- ERP relations ---

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  tenant: one(tenants, { fields: [suppliers.tenantId], references: [tenants.id] }),
  expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  tenant: one(tenants, { fields: [expenses.tenantId], references: [tenants.id] }),
  supplier: one(suppliers, { fields: [expenses.supplierId], references: [suppliers.id] }),
}));
