const dns = require("dns");

dns.resolveSrv(
  "_mongodb._tcp.cluster0.tdpigxl.mongodb.net",
  (err, records) => {
    if (err) {
      console.error("DNS Error:", err);
    } else {
      console.log(records);
    }
  }
);