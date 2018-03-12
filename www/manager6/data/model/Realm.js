Ext.define('pve-domains', {
    extend: "Ext.data.Model",
    fields: [
	'realm', 'type', 'comment', 'default', 'tfa',
	{
	    name: 'descr',
	    // Note: We use this in the RealmComboBox.js (see Bug #125)
	    convert: function(value, record) {
		if (value) {
		    return value;
		}

		var info = record.data;
		// return realm if there is no comment
		var text = info.comment || info.realm;

		if (info.tfa) {
		    text += " (+ " + info.tfa + ")";
		}

		return Ext.String.htmlEncode(text);
	    }
	}
    ],
    idProperty: 'realm',
    proxy: {
	type: 'proxmox',
	url: "/api2/json/access/domains"
    }
});
