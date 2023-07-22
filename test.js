const axios = require("axios");

const data = {
  to: [
    {
      email: "ajaysuresh792@gmail.com",
      name: "Ajay Suresh SJ",
    },
  ],
  templateId: 1,
  params: {
    name: "Ajay Suresh",
    surname: "SJ",
  },
  headers: {
    "X-Mailin-custom":
      "productImage:https://m.media-amazon.com/images/I/31FeKzJzVOS._SY445_SX342_QL70_ML2_.jpg",
    charset: "iso-8859-1",
  },
};

const headers = {
  accept: "application/json",
  "api-key":
    "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", // Replace with your actual API key from Brevo
  "content-type": "application/json",
};

axios
  .post("https://api.brevo.com/v3/smtp/email", data, { headers })
  .then((response) => {
    console.log("Email sent successfully.");
  })
  .catch((error) => {
    console.error("Error sending email:", error.message);
  });
