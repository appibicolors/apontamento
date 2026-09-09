export function ArticleLabel({code,name,className=""}:{code?:string|null;name:string;className?:string}){
 return <span className={`article-label ${className}`}><strong>{code||"SEM CÓDIGO"}</strong><span> - {name}</span></span>;
}
