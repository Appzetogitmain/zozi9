import('mongoose').then(async (mongoose) => {
  await mongoose.connect('mongodb+srv://zezi9:ZEZI9999@zezi9.m03cfd3.mongodb.net/Quick_commerce');
  const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
  
  const customerId = new mongoose.Types.ObjectId('6a1d3a217c7e85ab177098ce');
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const userOrders = await Order.find({
      customer: customerId,
      createdAt: { $gte: monthStart, $lte: now },
  }).lean();

  const monthlyVolume = userOrders.reduce(
      (sum, o) => sum + (o.paymentBreakdown?.grandTotal || 0),
      0
  );

  console.log('User orders found:', userOrders.length);
  console.log('Calculated Volume:', monthlyVolume);

  process.exit(0);
});
