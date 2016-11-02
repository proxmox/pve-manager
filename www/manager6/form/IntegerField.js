Ext.define('PVE.form.IntegerField',{
    extend: 'Ext.form.field.Number',
    alias: 'widget.pveIntegerField',

    allowDecimals: false,
    allowExponential: false,
    step: 1
});
