const products = [
{
name:"حاسوب محمول",
price:"799$",
image:"https://picsum.photos/300?1"
},
{
name:"هاتف ذكي",
price:"499$",
image:"https://picsum.photos/300?2"
},
{
name:"سماعات",
price:"89$",
image:"https://picsum.photos/300?3"
},
{
name:"ساعة ذكية",
price:"149$",
image:"https://picsum.photos/300?4"
},
{
name:"لوحة مفاتيح",
price:"39$",
image:"https://picsum.photos/300?5"
},
{
name:"فأرة ألعاب",
price:"29$",
image:"https://picsum.photos/300?6"
}
];

const container = document.getElementById("products");

function showProducts(list){
container.innerHTML="";

list.forEach(product=>{
container.innerHTML += `
<div class="card">
<img src="${product.image}">
<h3>${product.name}</h3>
<div class="price">${product.price}</div>
<button onclick="alert('تمت إضافة المنتج إلى السلة')">
إضافة إلى السلة
</button>
</div>
`;
});
}

showProducts(products);

document.getElementById("search").addEventListener("input",function(){
const value=this.value.toLowerCase();

const filtered=products.filter(p=>
p.name.toLowerCase().includes(value)
);

showProducts(filtered);
});