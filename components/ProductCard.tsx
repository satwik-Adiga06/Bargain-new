
import React from 'react';
import { Product } from '../types';

interface ProductCardProps {
  product: Product;
  isSelected: boolean;
  onToggle: (id: string) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, isSelected, onToggle }) => {
  return (
    <div
      onClick={() => onToggle(product.id)}
      className={`cursor-pointer transition-all duration-300 rounded-xl overflow-hidden border-2 ${isSelected
          ? 'border-cyan-400 bg-cyan-950/30 scale-[1.02] shadow-[0_0_20px_rgba(34,211,238,0.2)]'
          : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
        }`}
    >
      <img src={product.image} alt={product.name} className="w-full h-48 object-cover opacity-80 group-hover:opacity-100" />
      <div className="p-4">
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-bold text-lg text-slate-100">{product.name}</h3>
          <span className="text-cyan-400 font-mono font-bold">₹{product.price}</span>
        </div>
        <p className="text-sm text-slate-400 line-clamp-2">{product.description}</p>
        <div className="mt-4 flex items-center justify-end">
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected ? 'bg-cyan-400 border-cyan-400' : 'border-slate-700'
            }`}>
            {isSelected && (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-900" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
