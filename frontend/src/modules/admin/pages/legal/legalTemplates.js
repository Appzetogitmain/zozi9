// Starting points for the admin. They are generic drafts, not legal advice:
// the business should have the final text reviewed by a lawyer.
// {appName}, {companyName}, {supportEmail}, {supportPhone} and {address} are filled from General Settings.

const PRIVACY = `<p>This Privacy Policy explains how {companyName} ("we", "us") collects, uses and protects your personal data when you use {appName} as a customer, seller partner or delivery partner. By using {appName} you agree to this policy.</p>

<h2>1. Information we collect</h2>
<ul>
<li><strong>Account details:</strong> your name, mobile number and email address.</li>
<li><strong>Addresses and location:</strong> delivery addresses you save and your device location (only with your permission) to show nearby shops and deliver orders.</li>
<li><strong>Orders and payments:</strong> items you order, order history, refunds and wallet activity. Card and UPI payments are handled by our payment partners; we do not store your full card details.</li>
<li><strong>Device and usage data:</strong> device type, app version, IP address and how you use the app, to keep it secure and improve it.</li>
<li><strong>Seller partners:</strong> shop details, business documents (such as GST or FSSAI), bank account details for payouts and shop location.</li>
<li><strong>Delivery partners:</strong> identity and vehicle documents, bank details, and live location while you are on duty.</li>
</ul>

<h2>2. How we use your information</h2>
<ul>
<li>To create your account and verify your mobile number.</li>
<li>To process, deliver and support your orders, refunds and returns.</li>
<li>To send order updates, OTPs and service messages.</li>
<li>To run offers, rewards and referral programmes you take part in.</li>
<li>To prevent fraud and misuse, and to meet legal and tax requirements.</li>
</ul>

<h2>3. Who we share it with</h2>
<p>We share only what is needed to provide the service:</p>
<ul>
<li><strong>Sellers and delivery partners</strong> receive your name, phone number and delivery address to fulfil your order.</li>
<li><strong>Service providers</strong> such as payment gateways, SMS and notification services, maps and cloud hosting, under confidentiality obligations.</li>
<li><strong>Authorities</strong> when required by law or to protect the rights and safety of our users.</li>
</ul>
<p>We do not sell your personal data.</p>

<h2>4. Data retention</h2>
<p>We keep your data while your account is active and afterwards only as long as needed for legal, tax and dispute-resolution purposes.</p>

<h2>5. Security</h2>
<p>We use reasonable technical and organisational measures, such as encryption in transit and access controls, to protect your data. No system is completely secure, so please keep your OTP and device safe.</p>

<h2>6. Your rights</h2>
<p>Under the Digital Personal Data Protection Act, 2023 and other applicable Indian law, you can ask to access, correct or delete your personal data, and withdraw consent you have given. To do so, contact us at {supportEmail}. Deleting your account may not remove data we must keep by law.</p>

<h2>7. Children</h2>
<p>{appName} is not meant for children under 18. We do not knowingly collect data from children.</p>

<h2>8. Changes to this policy</h2>
<p>We may update this policy from time to time. The "Last updated" date at the top shows the latest version. Continued use of {appName} means you accept the updated policy.</p>

<h2>9. Contact and grievance officer</h2>
<p>For questions or complaints about your data, contact us:</p>
<ul>
<li>Email: {supportEmail}</li>
<li>Phone: {supportPhone}</li>
<li>Address: {address}</li>
</ul>`;

const TERMS = `<p>These Terms & Conditions govern your use of {appName}, operated by {companyName}. By creating an account or placing an order you agree to these terms.</p>

<h2>1. Eligibility and account</h2>
<ul>
<li>You must be at least 18 years old and able to enter a binding contract.</li>
<li>You are responsible for your account and for keeping your OTP private.</li>
<li>Information you give us must be accurate and up to date.</li>
</ul>

<h2>2. Orders and pricing</h2>
<ul>
<li>Products are sold by independent sellers on {appName}. Prices, offers and availability can change without notice.</li>
<li>An order is confirmed only when you receive an order confirmation. We or the seller may cancel an order if an item is unavailable, a shop is closed, or the order looks fraudulent; any amount paid is refunded.</li>
<li>Delivery, handling and platform fees are shown at checkout before you pay.</li>
</ul>

<h2>3. Payments</h2>
<p>You can pay online, by cash on delivery where available, or with your {appName} wallet balance. Online payments are processed by secure third-party payment gateways.</p>

<h2>4. Delivery</h2>
<p>Delivery times shown are estimates. Please make sure someone is available at the delivery address. Orders may need an OTP to be handed over.</p>

<h2>5. Cancellations, returns and refunds</h2>
<ul>
<li>You can cancel an order before it is picked up for delivery.</li>
<li>Eligible items can be returned within the return window shown in the app if they are damaged, wrong or expired.</li>
<li>Approved refunds are credited to the original payment method or your wallet.</li>
</ul>

<h2>6. Wallet, rewards and referrals</h2>
<p>Wallet balance, coupons, Spin & Win rewards and Refer & Earn rewards have no cash value, cannot be transferred, and follow the rules and expiry dates shown in the app. We may withdraw rewards obtained through misuse or fake accounts.</p>

<h2>7. Prohibited use</h2>
<p>You must not misuse {appName}, for example by creating fake accounts, abusing offers, harming our systems, or harassing sellers or delivery partners.</p>

<h2>8. Limitation of liability</h2>
<p>Sellers are responsible for the quality of the products they sell. To the extent allowed by law, our liability for any order is limited to the amount you paid for that order.</p>

<h2>9. Governing law</h2>
<p>These terms are governed by the laws of India, and courts at our registered office location have jurisdiction.</p>

<h2>10. Contact</h2>
<p>Questions about these terms? Email {supportEmail} or call {supportPhone}.</p>`;

export const LEGAL_TEMPLATES = { PRIVACY, TERMS };
