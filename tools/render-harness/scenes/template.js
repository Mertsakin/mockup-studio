// Applies a showcase template by id. Env: T (template id), MARKERS=0 recommended.
module.exports=async(app,{env})=>{
  const t=app('TEMPLATES').find(x=>x.id===env.T);if(!t)throw new Error('unknown template '+env.T);
  app('applyTemplate')(t);
};
