Ext.define('PVE.form.ContentTypeSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveContentTypeSelector'],

    cts: undefined,

    initComponent: function() {
	var me = this;

	me.comboItems = [];

	if (me.cts === undefined) {
	    me.cts = ['images', 'iso', 'vztmpl', 'backup', 'rootdir'];
	}

	Ext.Array.each(me.cts, function(ct) {
	    me.comboItems.push([ct, PVE.Utils.format_content_types(ct)]);
	});

	me.callParent();
    }
});
