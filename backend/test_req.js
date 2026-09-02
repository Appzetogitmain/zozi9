import axios from 'axios';

async function test() {
  try {
    const res = await axios.post('http://localhost:7000/api/seller/verification/send-otp', {
      channel: 'phone',
      phone: '8982292201'
    });
    console.log("Success:", res.data);
  } catch (err) {
    console.error("Error:", err.response ? err.response.data : err.message);
  }
}

test();
