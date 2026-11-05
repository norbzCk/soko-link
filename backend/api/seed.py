from datetime import date

from sqlalchemy.orm import Session

from backend.services.identity.auth import hash_password
from backend.shared.models import BusinessMetrics, BusinessUser, Product, Provider, Sale


def seed_marketplace_demo_data(db: Session) -> None:
    if db.query(Product).filter(Product.is_active.isnot(False)).count() > 0:
        return

    demo_sellers = [
        {
            "business_name": "Kariakoo Fresh Hub",
            "owner_name": "Amina Salim",
            "phone": "+255700100001",
            "email": "seller1@sokolink.local",
            "region": "Dar es Salaam",
            "area": "Kariakoo",
            "street": "Msimbazi Street",
            "category": "Fresh Produce",
        },
        {
            "business_name": "Coastal Home Supplies",
            "owner_name": "Juma Mushi",
            "phone": "+255700100002",
            "email": "seller2@sokolink.local",
            "region": "Dar es Salaam",
            "area": "Ilala",
            "street": "Uhuru Street",
            "category": "Household",
        },
    ]
    sellers: list[BusinessUser] = []
    for entry in demo_sellers:
        existing = db.query(BusinessUser).filter(BusinessUser.phone == entry["phone"]).first()
        if existing:
            sellers.append(existing)
            continue
        model = BusinessUser(
            business_name=entry["business_name"],
            owner_name=entry["owner_name"],
            phone=entry["phone"],
            email=entry["email"],
            password_hash=hash_password("demo12345"),
            business_type="individual",
            category=entry["category"],
            region=entry["region"],
            area=entry["area"],
            street=entry["street"],
            role="seller",
            is_active=True,
            is_verified=True,
            verification_status="verified",
        )
        db.add(model)
        db.flush()
        db.add(BusinessMetrics(business_id=model.id))
        sellers.append(model)

    provider = db.query(Provider).filter(Provider.name == "SokoLink Demo Supplier").first()
    if not provider:
        provider = Provider(
            name="SokoLink Demo Supplier",
            location="Dar es Salaam",
            email="supplier@sokolink.local",
            phone="+255700100010",
            verified=True,
            response_time="< 3 hrs",
            min_order_qty="20 units",
        )
        db.add(provider)
        db.flush()

    # Category-based placeholder images
    CATEGORY_PLACEHOLDERS = {
        "Groceries": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80",
        "Electronics": "https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=600&q=80",
        "Household": "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=600&q=80",
        "Fashion": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=600&q=80",
        "Accessory": "https://images.unsplash.com/photo-1463171379579-3fdfb86d6285?auto=format&fit=crop&w=600&q=80",
        "Footwear": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
        "Bags": "https://images.unsplash.com/photo-1590874103328-27cf28d6c78a?auto=format&fit=crop&w=600&q=80",
        "Shoes": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
        "Office": "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80",
        "Official Clothes": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=600&q=80",
        "Furniture": "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=600&q=80",
        "stationery": "https://images.unsplash.com/photo-1533613790285-ccb864783284?auto=format&fit=crop&w=600&q=80",
        "Electronic": "https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=600&q=80",
        "cloth": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=600&q=80",
        "women bag": "https://images.unsplash.com/photo-1590874103328-27cf28d6c78a?auto=format&fit=crop&w=600&q=80",
    }
    
    demo_products = [
        {
            "name": "Premium Rice 25kg",
            "category": "Groceries",
            "price": 69000,
            "stock": 44,
            "description": "Long grain rice sourced for retail and wholesale orders.",
            "seller_idx": 0,
        },
        {
            "name": "Sunflower Cooking Oil 5L",
            "category": "Groceries",
            "price": 26500,
            "stock": 62,
            "description": "Refined cooking oil for households and restaurants.",
            "seller_idx": 1,
        },
        {
            "name": "Laundry Soap Bar Pack",
            "category": "Household",
            "price": 12000,
            "stock": 90,
            "description": "Durable multipurpose soap bars in bulk-friendly packs.",
            "seller_idx": 1,
        },
    ]
    for entry in demo_products:
        if db.query(Product).filter(Product.name == entry["name"]).first():
            continue
        seller = sellers[entry["seller_idx"]] if sellers else None
        db.add(
            Product(
                name=entry["name"],
                category=entry["category"],
                price=entry["price"],
                stock=entry["stock"],
                description=entry["description"],
                seller_id=seller.id if seller else None,
                provider_id=provider.id if provider else None,
                is_active=True,
            )
        )
    
    # Add products with images for categories that have uploaded images
    image_products = [
        ("Handbag", "Accessory", 1, "/uploads/74eeeddc54eb48cb931252a116bc5148.jpeg"),
        ("Sandals", "footwear", 6, "/uploads/d6f7031c161848f4b68a03f5bb834759.png"),
        ("Backpack", "Bags", 1, "/uploads/542a938ed44c4e6481cccb41b0db31dd.png"),
        ("Dress Shoes", "Shoes", 1, "/uploads/17865ee571754740a1c4065da623cd0c.jpeg"),
        ("Belt", "Accessory", 1, "/uploads/848c262a4baf46e7909db12a425e2946.jpeg"),
        ("Sandals", "footwear", 6, "/uploads/cc6b73616aa3477383baf7ba3968cf54.jpeg"),
        ("Hand bag", "women bag", 6, "/uploads/68fdc12706da4850ba89669b2e04dd67.jpeg"),
        ("Briefcase", "Office", 1, "/uploads/d5a6aef2ece94f3d891836030027f8d1.jpeg"),
        ("Monochrome Men's Outfit", "Fashion", 2, "/uploads/7221f94f97284faa8dc914f91d7a012c.jpeg"),
        ("Laptopbag", "bags", 1, "/uploads/3aefe98958804f51ac8a9c807b1172db.jpeg"),
        ("Men Suit", "Official Clothes", 2, "/uploads/b4622c6199f548d2b50dfd15c7ff7acc.jpeg"),
        ("Men's Fashion", "Fashion", 2, "/uploads/1a93f907d5ca4f21bb5bbef8d4534722.jpeg"),
    ]
    for name, category, seller_idx, image_url in image_products:
        if db.query(Product).filter(Product.name == name).first():
            continue
        seller = sellers[seller_idx] if seller_idx < len(sellers) else None
        db.add(
            Product(
                name=name,
                category=category,
                price=25000,
                stock=10,
                description=f"High quality {category} product.",
                image_url=image_url,
                seller_id=seller.id if seller else None,
                is_active=True,
            )
        )

    db.commit()

    # Ensure all products have sellers assigned
    ensure_product_seller_assignments(db)

    # Seed sample sales if none exist (for dashboard graphs)
    if db.query(Sale).count() == 0:
        sample_sales = []
        # Get a few products with sellers
        demo_products = db.query(Product).filter(Product.seller_id.isnot(None)).limit(5).all()
        for product in demo_products:
            sample_sales.append(
                Sale(
                    date=date.today(),
                    product=product.name,
                    category=product.category,
                    product_id=product.id,
                    seller_id=product.seller_id,
                    quantity=2,
                    unit_price=product.price,
                    status="Received",
                    rating=5,
                )
            )
        db.add_all(sample_sales)
        db.commit()


def ensure_product_seller_assignments(db: Session) -> None:
    """
    Ensure all active products have a seller_id assigned. Products without a seller
    are assigned to the first available seller in their category, or deactivated
    if no suitable seller exists.
    """
    # Find active products without seller_id
    products_without_seller = db.query(Product).filter(
        Product.is_active.isnot(False),
        Product.seller_id.is_(None)
    ).all()
    
    if not products_without_seller:
        return
    
    # Get all active sellers
    sellers = db.query(BusinessUser).filter(
        BusinessUser.is_active == True,
        BusinessUser.role == "seller"
    ).all()
    
    # Build category -> seller mapping
    category_to_sellers = {}
    for seller in sellers:
        cat = seller.category or ""
        if cat not in category_to_sellers:
            category_to_sellers[cat] = []
        category_to_sellers[cat].append(seller)
    
    # Also build category mapping from products that already have sellers
    product_category_to_seller = {}
    assigned_products = db.query(Product).filter(
        Product.is_active.isnot(False),
        Product.seller_id.isnot(None)
    ).all()
    for p in assigned_products:
        cat = p.category or ""
        if cat and cat not in product_category_to_seller and p.seller_id:
            seller = db.query(BusinessUser).filter(BusinessUser.id == p.seller_id).first()
            if seller:
                
                product_category_to_seller[cat] = seller
    
    for product in products_without_seller:
        cat = product.category or ""
        seller = None
        
        # Try category-based assignment
        if cat and cat in product_category_to_seller:
            seller = product_category_to_seller[cat]
        elif cat and cat in category_to_sellers and category_to_sellers[cat]:
            seller = category_to_sellers[cat][0]
        # Try any available seller
        elif sellers:
            seller = sellers[0]
        
        if seller:
            product.seller_id = seller.id
            db.add(product)
            print(f"  Assigned product '{product.name}' (category: {cat}) to seller '{seller.business_name}'")
        else:
            # No seller available - deactivate product
            product.is_active = False
            db.add(product)
            print(f"  Deactivated product '{product.name}' - no seller available")
    
    db.commit()
    print(f"  Completed: {len(products_without_seller)} products processed")
