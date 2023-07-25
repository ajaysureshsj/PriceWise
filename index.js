require('dotenv').config();

const express = require("express");
const ejs = require("ejs");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const sha256 = require("sha256");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const axios = require("axios");
const cheerio = require("cheerio");
const cron = require("node-cron"); // Add this line to import node-cron
const { setTimeout } = require("timers"); // Add this line to import setTimeout
const app = express();

// ------------------------------------------------------------------------------- //

// Setting preferences //
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
const oneDay = 1000 * 60 * 60 * 24;
app.use(
  session({
    secret: process.env.SECRET_KEY,
    saveUninitialized: true,
    cookie: { maxAge: oneDay },
    resave: false,
  })
);

// ------------------------------------------------------------------------------- //

// Databse MongoDB //
const url = process.env.MONGO_DB;
mongoose.connect(url);
const newUser = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  password: String,
});

const newProduct = new mongoose.Schema({
  productUrl: String,
  targetPrice: Number,
  title: String,
  currentPrice: Number,
  imageUrl: String,
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Users",
  },
});

const User = mongoose.model("Users", newUser);
const Product = mongoose.model("Products", newProduct);
// ------------------------------------------------------------------------------- //

// ------------------------------------------------------------------------------- //

// Get routes //
app.get("/dashboard", async function (req, res) {
  if (req.session.userid) {
    try {
      const user = await User.findById(req.session.userid); // Retrieve user's information from the database
      if (user) {
        // Find all products added by the logged-in user using their user ID
        Product.find({ addedBy: user._id.toString() })
          .then((catalogue) => {
            // Render the dashboard view with the user's first name and the tracked products
            res.render("dashboard", {
              username: user.firstName,
              products: catalogue,
            });
          })
          .catch((error) => {
            console.error("Error fetching user's tracked products:", error);
            // Render the dashboard view with the user's first name and an empty array for products (even if there's an error)
            res.render("dashboard", {
              username: user.firstName,
              products: [],
            });
          });
      } else {
        // User not found in the database
        res.redirect("/");
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      res.render("index");
    }
  } else {
    // User is not logged in
    res.render("index");
  }
});

app.get("/", function (req, res) {
  res.render("index");
});

app.get("/signup", function (req, res) {
  //Signup
  res.render("signup");
});

app.get("/login", function (req, res) {
  //Login
  res.render("login");
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("/track",function(req,res){
  res.redirect("/dashboard")
})
// ------------------------------------------------------------------------------- //

// Post routes //
app.post("/signup", function (req, res) {
  //Signup
  const newUser = new User({
    firstName: req.body.fName,
    lastName: req.body.lName,
    email: req.body.email,
    password: sha256(req.body.password),
  });

  console.log(newUser);

  newUser.save().then(function (result) {
    if (result) {
      console.log(`New user:\n ${newUser}`);
      res.redirect("/login");
    } else {
      console.log(`Error detected while saving user to MongoDB`);
    }
  });
});

app.post("/dashboard", function (req, res) {
  // Login
  const username = req.body.email;
  const password = sha256(req.body.password);

  User.findOne({ email: username }).then(function (result) {
    if (result) {
      if (password === result.password) {
        console.log(`${result.firstName} Logged In Successfully.`);
        // Correctly assign the user ID to the session
        req.session.userid = result._id.toString(); // Assuming the User model has an "_id" field.
        console.log(req.session);

        // Find all products added by the logged-in user using their user ID
        Product.find({ addedBy: result._id.toString() })
          .then((catalogue) => {
            // Render the dashboard view with the user's first name and the tracked products
            res.render("dashboard", {
              username: result.firstName,
              products: catalogue,
            });
          })
          .catch((error) => {
            console.error("Error fetching user's tracked products:", error);
            // Render the dashboard view with the user's first name and an empty array for products (even if there's an error)
            res.render("dashboard", {
              username: result.firstName,
              products: [],
            });
          });
      } else {
        console.log("Invalid Credentials.");
        res.render("login");
      }
    } else {
      console.log("User does not exist.");
      res.render("signup");
    }
  });
});

app.post("/track", function (req, res) {
  // Fetch the product page to get the latest details
  axios
    .get(req.body.productUrl)
    .then((response) => {
      const htmlContent = response.data;
      const $ = cheerio.load(htmlContent);

      // Get product title
      const productTitle = $("#productTitle").text().trim();
      console.log(productTitle);

      // Get product price
      const productPriceString = $(".a-price .a-offscreen")
        .first()
        .text()
        .trim();
      const productPrice = parseFloat(
        productPriceString.replace(/[^0-9.]/g, "")
      );
      console.log(productPrice);

      // Get product image URL
      const productImage = $("#landingImage").attr("src");
      console.log(productImage);

      // Compare the fetched price with the user's target price
      if (productPrice <= req.body.targetPrice) {
        // Send notification to the user via email
        User.findOne({ _id: req.session.userid }).then(function (result) {
          const data = {
            sender: {
              name: "Pricewise",
              email: "pricewise.alerts@gmail.com",
            },
            to: [
              {
                email: result.email,
                name: result.firstName,
              },
            ],
            subject: `Price drop alert for ${productTitle}`,
            htmlContent: `
            <html>
            <head>
              <title>Price Drop Alert</title>
            </head>
            <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f9f9f9;">
              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                style="max-width: 600px; margin: 0 auto; background-color: #fff; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); border-radius: 5px;"
              >
                <tr>
                  <td style="padding: 20px;">
                    <h1 style="font-size: 24px; margin: 0; padding: 0; color: #333;">Hello ${result.firstName},</h1>
                    <p style="margin: 10px 0; padding: 0; color: #555;">
                      The price of <b>${productTitle}</b> has dropped to
                      <b>₹${productPrice}</b>.
                    </p>
                    <img
                      src="${productImage}"
                      alt="Product image"
                      style="max-width: 100%; height: auto; display: block; margin-top: 20px; border-radius: 5px;"
                    />
                    <p style="margin: 20px 0 0; padding: 0;">
                      <a
                        href="${req.body.productUrl}"
                        style="display: inline-block; padding: 10px 20px; background-color: #E50914; color: #000; text-decoration: none; border-radius: 5px;"
                      >
                        <b>Grab Deal</b>
                      </a>
                    </p>
                  </td>
                </tr>
              </table>
            </body>
          </html>
          
            `,
          };
      
          const headers = {
            accept: "application/json",
            "api-key": process.env.API_KEY,
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
        });
      }
      
        

      // Create a new product with user details
      const newProduct = new Product({
        productUrl: req.body.productUrl,
        targetPrice: req.body.targetPrice,
        title: productTitle,
        currentPrice: productPrice,
        imageUrl: productImage,
        addedBy: req.session.userid, // Set the user ID of the user who added the product
      });

      // Save the new product to the database
      return newProduct.save();
    })
    .then((result) => {
      if (result) {
        console.log(`New product added to tracking:\n ${result}`);
        // Fetch the updated list of tracked products
        Product.find({ addedBy: req.session.userid })
          .then((catalogue) => {
            User.findOne({ _id: req.session.userid}).then(function (result){
              res.render("dashboard", {
                username: result.firstName,
                products: catalogue,
              });
            })
            .catch((error) => {
              console.error("Error fetching user's tracked products:", error);
              // Render the dashboard with the user's ID and an empty array for products (even if there's an error)
              res.render("dashboard", {
                username: result.firstName,
                products: [],
              });
            });
            })
            // Render the dashboard with the updated list of tracked products  
      } else {
        console.log(`An error occurred while adding the product.`);
        res.redirect("/dashboard");
      }
    })
    .catch((error) => {
      console.error("Error fetching product page:", error);
      res.redirect("/dashboard");
    });
});

function checkPriceDrops() {
  console.log("Cron job running at: ", new Date());
  // Fetch all products from the database
  Product.find({})
    .then((products) => {
      let index = 0;
      function processProduct() {
        if (index < products.length) {
          const product = products[index];
          // Fetch the product page to get the latest details
          axios
            .get(product.productUrl)
            .then((response) => {
              const htmlContent = response.data;
              const $ = cheerio.load(htmlContent);

              // Get the current product price
              const productPriceString = $(".a-price .a-offscreen")
                .first()
                .text()
                .trim();
              const productPrice = parseFloat(
                productPriceString.replace(/[^0-9.]/g, "")
              );

              // Check if the current price is below the target price
              if (productPrice <= product.targetPrice) {
                // Send notification to the user via email
                User.findOne({ _id: product.addedBy }).then(function (result) {
                  const data = {
                    sender: {
                      name: "Pricewise",
                      email: "pricewise.alerts@gmail.com",
                    },
                    to: [
                      {
                        email: result.email,
                        name: result.firstName,
                      },
                    ],
                    subject: `Price drop alert for ${product.title}`,
                    htmlContent: `
                    <html>
                    <head>
                      <title>Price Drop Alert</title>
                    </head>
                    <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f9f9f9;">
                      <table
                        width="100%"
                        cellpadding="0"
                        cellspacing="0"
                        style="max-width: 600px; margin: 0 auto; background-color: #fff; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); border-radius: 5px;"
                      >
                        <tr>
                          <td style="padding: 20px;">
                            <h1 style="font-size: 24px; margin: 0; padding: 0; color: #333;">Hello ${result.firstName},</h1>
                            <p style="margin: 10px 0; padding: 0; color: #555;">
                              The price of <b>${product.title}</b> has dropped to
                              <b>₹${productPrice}</b>.
                            </p>
                            <img
                              src="${product.imageUrl}"
                              alt="Product image"
                              style="max-width: 100%; height: auto; display: block; margin-top: 20px; border-radius: 5px;"
                            />
                            <p style="margin: 20px 0 0; padding: 0;">
                              <a
                                href="${product.productUrl}"
                                style="display: inline-block; padding: 10px 20px; background-color: #E50914; color: #000; text-decoration: none; border-radius: 5px;"
                              >
                                <b>Grab Deal</b>
                              </a>
                            </p>
                          </td>
                        </tr>
                      </table>
                    </body>
                  </html>
                  
                    `,
                  };
              
                  const headers = {
                    accept: "application/json",
                    "api-key": process.env.API_KEY,
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
                });
              }

              // Update the product's current price in the database
              product.currentPrice = productPrice;
              product.save();

              // Move on to the next product after a 5-second delay
              setTimeout(() => {
                index++;
                processProduct();
              }, 5000); // Delay of 5 seconds (5000 milliseconds)
            })
            .catch((error) => {
              console.error("Error fetching product page:", error);
              // Move on to the next product after a 5-second delay (even in case of error)
              setTimeout(() => {
                index++;
                processProduct();
              }, 5000); // Delay of 5 seconds (5000 milliseconds)
            });
        }
      }

      // Start processing the products
      processProduct();
    })
    .catch((error) => {
      console.error("Error fetching products:", error);
    });
}

// Schedule price drop check to run every 24 hours (at midnight)
cron.schedule("0 0 * * *", checkPriceDrops);

// Listener
app.listen("3004", function () {
  console.log("Server running in dev mode at port 3004.");
});
