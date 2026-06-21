const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {

        schoolId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "School",
            required: true,
        },

        role: {
            type: String,
            enum: [
                "PRODUCT_ADMIN",
                "SUPER_ADMIN",
                "SCHOOL_ADMIN",
                "TEACHER",
                "STUDENT",
                "PARENT",
            ],
            required: true,
        },

        firstName: {
            type: String,
            required: true,
            trim: true,
        },

        lastName: {
            type: String,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            lowercase: true,
            unique: true,
        },

        phone: {
            type: String,
            required: true,
            unique: true,
        },
        phoneCode:{
             type: String,
            required: true,
        },

        password: {
            type: String,
            // required: true,
        },

        profileImage: {
            type: String,
            default: "",
        },

        gender: {
            type: String,
            enum: ["Male", "Female", "Other"],
        },

        dob: {
            type: Date,
        },

        address: {
            type: String,
        },

        status: {
            type: String,
            enum: ["ACTIVE", "INACTIVE", "REQUESTED"],
            default: "REQUESTED",
        },

        // STUDENT FIELDS
        admissionNumber: String,
        rollNumber: String,
        grade: String,
        section: String,

        // PARENT FIELDS
        relationship: {
            type: String,
            enum: ["Father", "Mother", "Guardian"],
        },

        children: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],

        // TEACHER FIELDS
        staffId: String,
        department: String,
        qualification: String,
        experience: Number,
        subjects: [String],
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("User", userSchema);

// {
//   "role": "STUDENT",
//   "firstName": "Arun",
//   "email": "arun@gmail.com",
//   "admissionNumber": "ADM001",
//   "rollNumber": "10A001",
//   "grade": "10",
//   "section": "A"
// }


// {
//   "role": "TEACHER",
//   "firstName": "Priya",
//   "email": "priya@gmail.com",
//   "employeeId": "EMP001",
//   "department": "Mathematics",
//   "subjects": ["Maths", "Physics"]
// }

// {
//   "role": "PARENT",
//   "firstName": "Ramesh",
//   "email": "ramesh@gmail.com",
//   "relationship": "Father",
//   "children": [
//     "685123456789abcdef123456"
//   ]
// }

// {
//   "role": "SCHOOL_ADMIN",
//   "firstName": "Admin",
//   "email": "admin@school.com"
// }