// Display highlighting for ROS interfaces; this does not validate or execute ROS code.
export default {name:'ros2-interface',scopeName:'source.ros2-interface',patterns:[
 {name:'comment.line.number-sign',match:'#.*$'},
 {name:'keyword.control',match:'^---\\s*$'},
 {name:'storage.type',match:'\\b(?:bool|byte|char|float32|float64|u?int(?:8|16|32|64)|w?string)\\b'},
 {name:'entity.name.type',match:'\\b[A-Za-z][A-Za-z0-9_]*/(?:msg/)?[A-Z][A-Za-z0-9_]*\\b'},
 {name:'variable.other.constant',match:'\\b[A-Z][A-Z0-9_]*\\s*(?==)'},
 {name:'constant.numeric',match:'\\b(?:0x[0-9a-fA-F]+|[0-9]+(?:\\.[0-9]+)?)\\b'},
 {name:'string.quoted.double',begin:'"',end:'"',patterns:[{name:'constant.character.escape',match:'\\\\.'}]},
 {name:'string.quoted.single',begin:"'",end:"'",patterns:[{name:'constant.character.escape',match:'\\\\.'}]}
]};
