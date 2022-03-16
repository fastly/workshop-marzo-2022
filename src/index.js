var Mustache = require("mustache");

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

async function handleRequest(event) {
  // Get the client request.
  let req = event.request;

  // Filter requests that have unexpected methods.
  if (!["HEAD", "GET", "POST"].includes(req.method)) {
    return new Response("This method is not allowed", {
      status: 405,
    });
  }

  let url = new URL(req.url);

  if (url.pathname == "/catalog") {

    url.pathname = "/api/products";

    let response = await fetch(new Request(url, req), {
      backend: "origin1",
    });

    response.headers.delete("x-powered-by");

    return response;
  }

  if(url.pathname.match("/product/(.*)")){
    let product_id = url.pathname.match("/product/(.*)");
    let product_data = await fetch(new Request(`http://origin1.workshop.rest/api/product/${product_id[1]}`, req),{
      backend: "origin1",
    });

    let inventory_data = await fetch(new Request(`http://origin2.workshop.rest/api/inventory/${product_id[1]}`, req),{
      backend: "origin2",
    });

    let product = await product_data.json();
    let inventory = await inventory_data.json();

    product.amount = inventory.amount;

    return new Response(JSON.stringify(product), {
      status: 200,
      headers: new Headers({"Content-Type": "application/json"}),
    });
  }  

  if(url.pathname == "/cart"){
    url.pathname="/api/cart";

    let cart_data = await fetch(new Request(url, req), {
      backend: "origin1",
    });

    let cart = await cart_data.json();

    let total_weight = 0;

    cart.forEach((item) => {
      total_weight = total_weight + item.item_weight * item.amount;
      delete item["item_weight"];
    });

    let shipping_data = await fetch(new Request("http://origin2.workshop.rest/api/shipping", {
      backend: "origin2",
      method: "POST",
      headers: new Headers({"Content-Type": "application/x-www-form-urlencoded"}),
      body: `weight=${total_weight}`,
    }));

    let shipping = await shipping_data.json();

    let response = {};
    response.items = cart;
    response.shipping = shipping.cost;

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: new Headers({"Content-Type": "application/json"}),
    });

  }

  if(url.pathname == "/order/new" && req.method == "POST"){
    url.pathname = "/api/order/new"
    let req_body = await req.json();

    let order_data = await fetch(new Request(url, {
      backend: "origin1",
      method: "POST",
      headers: new Headers({"Content-Type": "application/json"}),
      body: JSON.stringify(req_body),
    }));

    let order_id = await order_data.json();
    
    let warehouse_payload = {};
    warehouse_payload.items = req_body.items;
    warehouse_payload.order_id = order_id.order_id;

    let warehouse_req_init = {
      backend: "origin2",
      method: "POST",
      headers: new Headers({"Content-Type": "application/json"}),
      body: JSON.stringify(warehouse_payload),
    };

    let inventory_data = await fetch(new Request("http://origin2.workshop.rest/api/inventory", warehouse_req_init));
    let fulfillment_data = await fetch(new Request("http://origin2.workshop.rest/api/fulfillment", warehouse_req_init));

    let inventory_response = await inventory_data.json();
    let fullfillment_response = await fulfillment_data.json();

    let response = {inventory_response, fullfillment_response};
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: new Headers({"Content-Type": "application/json"}),
    });
  }

  if( url.pathname.match("/order/id/(.*)")){
    let order_id = url.pathname.match("/order/id/(.*)");
    url.pathname = `/api/order/${order_id[1]}`;

    let order_data = await fetch(new Request(url, req), {
      backend: "origin1",
    });

    let order = await order_data.json();

    let fulfillment_data = await fetch(new Request(`http://origin2.workshop.rest/api/fulfillment/${order_id[1]}`, {
      backend: "origin2",
      method: "GET",
    }));

    let fulfillment = await fulfillment_data.json();

    order.status = fulfillment.status;
    order.created_at = new Date(order.created_at).toLocaleString("es-es");

    let template = require("./order.html");
    let output = Mustache.render(template, order);

    return new Response(output, {
      status: 200,
      headers: new Headers({"Content-Type": "text/html; charset=utf-8"}),
    });


  }


  // Catch all other requests and return a 404.
  return new Response("The page you requested could not be found", {
    status: 404,
  });
}
