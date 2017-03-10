Ext.define('PVE.RestProxy', {
    extend: 'Ext.data.RestProxy',
    alias : 'proxy.pve',
    
    pageParam : null,
    startParam: null,
    limitParam: null,
    groupParam: null,
    sortParam: null,
    filterParam: null,
    noCache : false,
    afterRequest: function(request, success) {
		this.fireEvent('afterload', this, request, success);
		return;
	},

    constructor: function(config) {

	Ext.applyIf(config, {	    
	    reader: {
		type: 'json',
		rootProperty: config.root || 'data'
	    }
	});

	this.callParent([config]); 
    }

}, function() {

    Ext.define('pve-domains', {
	extend: "Ext.data.Model",
	fields: [ 'realm', 'type', 'comment', 'default', 'tfa',
		  { 
		      name: 'descr',
		      // Note: We use this in the RealmComboBox.js
		      // (see Bug #125)
		      convert: function(value, record) {
			  var info = record.data;
			  var text;

			  if (value) {
			      return value;
			  }
			  // return realm if there is no comment
			  text = info.comment || info.realm;

			  if (info.tfa) {
			      text += " (+ " + info.tfa + ")";
			  }

			  return Ext.String.htmlEncode(text);
		      }
		  }
		],
	proxy: {
	    type: 'pve',
	    url: "/api2/json/access/domains"
	}
    });

    Ext.define('KeyValue', {
	extend: "Ext.data.Model",
	fields: [ 'key', 'value' ],
	idProperty: 'key'
    });

    Ext.define('KeyValuePendingDelete', {
	extend: "Ext.data.Model",
	fields: [ 'key', 'value', 'pending', 'delete' ],
	idProperty: 'key'
    });

    Ext.define('pve-string-list', {
	extend: 'Ext.data.Model',
	fields:  [ 'n', 't' ],
	idProperty: 'n'
    });

    Ext.define('pve-tasks', {
	extend: 'Ext.data.Model',
	fields:  [ 
	    { name: 'starttime', type : 'date', dateFormat: 'timestamp' }, 
	    { name: 'endtime', type : 'date', dateFormat: 'timestamp' }, 
	    { name: 'pid', type: 'int' },
	    'node', 'upid', 'user', 'status', 'type', 'id'
	],
	idProperty: 'upid'
    });

    Ext.define('pve-cluster-log', {
	extend: 'Ext.data.Model',
	fields:  [ 
	    { name: 'uid' , type: 'int' },
	    { name: 'time', type : 'date', dateFormat: 'timestamp' }, 
	    { name: 'pri', type: 'int' },
	    { name: 'pid', type: 'int' },
	    'node', 'user', 'tag', 'msg', 'id'
	],
	idProperty: 'id'
    });
});
